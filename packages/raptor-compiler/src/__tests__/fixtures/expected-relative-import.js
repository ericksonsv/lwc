define('myns-relative_import', ['engine'], function (engine) {

function tmpl($api, $cmp, $slotset, $ctx) {
  return [$api.h("section", {}, [])];
}

function test() {}

function sibling() {}

function inner() {
    return sibling();
}

class RelativeImport extends engine.Element {
    constructor() {
        super();
        this.x = test();
        this.y = inner();
    }

    render() {
        return tmpl;
    }

}

return RelativeImport;

});