export default function tmpl($api, $cmp, $slotset, $ctx) {
    return [$api.h(
        "section",
        {},
        [$api.h(
            "p",
            {
                className: $cmp.bar
            },
            []
        )]
    )];
}
tmpl.ids = ["bar"];
