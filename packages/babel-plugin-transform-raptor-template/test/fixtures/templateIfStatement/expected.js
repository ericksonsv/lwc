const memoized = Symbol();
export default function ($api, $cmp, $slotset) {
    const _expr = $cmp.isTrue || undefined;

    const m = $cmp[memoized] || ($cmp[memoized] = {});
    return [$api.h(
        "section",
        {},
        [_expr && $api.s($cmp.foo), _expr && $api.s($cmp.bar)]
    )];
}
export const templateUsedIds = ["isTrue", "foo", "bar"];