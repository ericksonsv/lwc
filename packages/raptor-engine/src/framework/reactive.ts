import assert from "./assert";
import {
    subscribeToSetHook,
    notifyListeners,
} from "./watcher";
import {
    isRendering,
    vmBeingRendered,
} from "./invoker";
import {
    toString,
    isArray,
    isObject,
    getOwnPropertyNames,
    getOwnPropertyDescriptor,
    isExtensible,
    defineProperty,
    preventExtensions,
    getPrototypeOf,
} from "./language";
import { TargetSlot, MembraneSlot, unwrap } from "./membrane";
import { XProxy } from './xproxy';

/*eslint-disable*/
export type ShadowTarget = (Object | Array<any>);
type Observable = (Object | Array<any>);
type Reactive = ProxyHandler<ReactiveProxyHandler>
/*eslint-enable*/

const ReactiveMap: WeakMap<Observable, Reactive> = new WeakMap();
const ObjectDotPrototype = Object.prototype;

function lockShadowTarget (shadowTarget: ShadowTarget, originalTarget: any): void {
    const targetKeys = getOwnPropertyNames(originalTarget);
    targetKeys.forEach((key) => {
        let descriptor = getOwnPropertyDescriptor(originalTarget, key);

        // We do not need to wrap the descriptor if not configurable
        // Because we can deal with wrapping it when user goes through
        // Get own property descriptor. There is also a chance that this descriptor
        // could change sometime in the future, so we can defer wrapping
        // until we need to
        if (!descriptor.configurable) {
            descriptor = wrapDescriptor(descriptor);
        }

        defineProperty(shadowTarget, key, descriptor);
    });

    preventExtensions(shadowTarget);
}

function wrapDescriptor(descriptor: PropertyDescriptor): PropertyDescriptor {
    if ('value' in descriptor) {
        descriptor.value = isObservable(descriptor.value) ? getReactiveProxy(descriptor.value) : descriptor.value;
    }
    return descriptor;
}

export function isObservable (value: any): boolean {
    if (!value) {
        return false;
    }
    if (isArray(value)) {
        return true;
    }
    const proto = getPrototypeOf(value);
    return (proto === ObjectDotPrototype || proto === null);
}

// Unwrap property descriptors
// We only need to unwrap if value is specified
function unwrapDescriptor(descriptor: PropertyDescriptor): PropertyDescriptor {
    if ('value' in descriptor) {
        descriptor.value = unwrap(descriptor.value);
    }
    return descriptor;
}

export class ReactiveProxyHandler {
    originalTarget: any; // eslint-disable-line no-undef
    constructor (value: any) {
        this.originalTarget = value;
    }
    get(shadowTarget: ShadowTarget, key: string | symbol): any {
        if (key === MembraneSlot) {
            return this;
        }
        const { originalTarget } = this;
        if (key === TargetSlot) {
            return originalTarget;
        }
        const value = originalTarget[key];

        if (isRendering && vmBeingRendered) {
            subscribeToSetHook(vmBeingRendered as VM, originalTarget, key); // eslint-disable-line no-undef
        }

        const observable = isObservable(value);
        assert.block(function devModeCheck () {
            if (!observable && isObject(value)) {
                if (isRendering) {
                    assert.logWarning(`Rendering a non-reactive value ${value} from member property ${key} of ${vmBeingRendered} is not common because mutations on that value will not re-render the template.`);
                } else {
                    assert.logWarning(`Returning a non-reactive value ${value} to member property ${key} of ${originalTarget} is not common because mutations on that value cannot be observed.`);
                }
            }
        });
        return observable ? getReactiveProxy(value) : value;
    }
    set(shadowTarget: ShadowTarget, key: string | symbol, value: any): boolean {
        const { originalTarget } = this;
        if (isRendering) {
            assert.logError(`Setting property "${toString(key)}" of ${toString(shadowTarget)} during the rendering process of ${vmBeingRendered} is invalid. The render phase must have no side effects on the state of any component.`);
            return false;
        }
        const oldValue = originalTarget[key];
        if (oldValue !== value) {
            originalTarget[key] = value;
            notifyListeners(originalTarget, key);
        } else if (key === 'length' && isArray(originalTarget)) {
            // fix for issue #236: push will add the new index, and by the time length
            // is updated, the internal length is already equal to the new length value
            // therefore, the oldValue is equal to the value. This is the forking logic
            // to support this use case.
            notifyListeners(originalTarget, key);
        }
        return true;
    }
    deleteProperty(shadowTarget: ShadowTarget, key: string | symbol): boolean {
        const { originalTarget } = this;
        delete originalTarget[key];
        notifyListeners(originalTarget, key);
        return true;
    }
    apply(target: any/*, thisArg: any, argArray?: any*/) {
        assert.fail(`invalid call invocation for property proxy ${target}`);
    }
    construct(target: any, argArray: any, newTarget?: any): any { // eslint-disable-line no-unused-vars
        assert.fail(`invalid construction invocation for property proxy ${target}`);
    }
    has(shadowTarget: ShadowTarget, key: string | symbol): boolean {
        const { originalTarget } = this;
        return key in originalTarget;
    }
    ownKeys(shadowTarget: ShadowTarget): Array<string> { // eslint-disable-line no-unused-vars
        const { originalTarget } = this;
        return getOwnPropertyNames(originalTarget);
    }
    isExtensible(shadowTarget: ShadowTarget): boolean {
        const shadowIsExtensible = isExtensible(shadowTarget);

        if (!shadowIsExtensible) {
            return shadowIsExtensible;
        }

        const { originalTarget } = this;
        const targetIsExtensible = isExtensible(originalTarget);

        if (!targetIsExtensible) {
            lockShadowTarget(shadowTarget, originalTarget);
        }

        return targetIsExtensible;
    }
    setPrototypeOf(shadowTarget: ShadowTarget, prototype: any) { // eslint-disable-line no-unused-vars
        assert.fail(`Invalid setPrototypeOf invocation for reactive proxy ${this.originalTarget}. Prototype of reactive objects cannot be changed.`);
    }
    getPrototypeOf(shadowTarget: ShadowTarget): Object { // eslint-disable-line no-unused-vars
        const { originalTarget } = this;
        return getPrototypeOf(originalTarget);
    }
    getOwnPropertyDescriptor(shadowTarget: ShadowTarget, key: string | symbol): PropertyDescriptor {
        const { originalTarget } = this;
        let desc = getOwnPropertyDescriptor(originalTarget, key);
        if (!desc) {
            return desc;
        }
        if (!desc.configurable && !(key in shadowTarget)) {
            // If descriptor from original target is not configurable,
            // We must copy the wrapped descriptor over to the shadow target.
            // Otherwise, proxy will throw an invariant error.
            // This is our last chance to lock the value.
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/handler/getOwnPropertyDescriptor#Invariants
            desc = wrapDescriptor(desc);
            defineProperty(shadowTarget, key, desc);
        }
        return desc;
    }
    preventExtensions(shadowTarget: ShadowTarget): boolean {
        const { originalTarget } = this;
        lockShadowTarget(shadowTarget, originalTarget);
        preventExtensions(originalTarget);
        return true;
    }
    defineProperty(shadowTarget: ShadowTarget, key: string | symbol, descriptor: PropertyDescriptor): boolean {
        const { originalTarget } = this;
        const { configurable } = descriptor;
        const unwrappedDescriptor = unwrapDescriptor(descriptor);
        if (configurable === false) {
            defineProperty(shadowTarget, key, unwrappedDescriptor);
        }
        defineProperty(originalTarget, key, unwrappedDescriptor);
        return true;
    }
}

export function getReactiveProxy(value: any): any {
    assert.isTrue(isObservable(value), "perf-optimization: avoid calling this method with non-observable values.");
    value = unwrap(value);
    let proxy = ReactiveMap.get(value);
    if (proxy) {
        return proxy;
    }
    const handler = new ReactiveProxyHandler(value);
    const shadowTarget = isArray(value) ? [] : {};
    proxy = new XProxy(shadowTarget, handler);
    ReactiveMap.set(value, proxy as Reactive);
    return proxy;
}