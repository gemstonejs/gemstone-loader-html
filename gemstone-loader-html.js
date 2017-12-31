/*
**  GemstoneJS -- Gemstone JavaScript Technology Stack
**  Copyright (c) 2016-2017 Gemstone Project <http://gemstonejs.com>
**  Licensed under Apache License 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  load external requirements  */
const co               = require("co")
const loaderUtils      = require("loader-utils")
const PostHTML         = require("posthtml")
const PostHTMLBlock    = require("posthtml-block")
const PostHTMLScope    = require("style-scope/posthtml")
const PostHTMLMarkdown = require("posthtml-md")
const PostHTMLLorem    = require("posthtml-lorem")
const inlineAssets     = require("inline-assets")
const vueValidator     = require("vue-template-validator")
const vueCompiler      = require("vue-template-compiler")
const jsBeautify       = require("js-beautify").js_beautify

/*  the exported Webpack loader function  */
module.exports = function (content) {
    const done = this.async()
    co(function * () {
        /*  determine Webpack loader query parameters  */
        const options = Object.assign({}, {
            scope: "none"
        }, loaderUtils.getOptions(this), this.resourceQuery ? loaderUtils.parseQuery(this.resourceQuery) : null)

        /*  indicate to Webpack that our results are
            fully deterministic and can be cached  */
        this.cacheable(true)

        /*  process HTML markup  */
        let response = yield (PostHTML([
            PostHTMLBlock,
            PostHTMLScope({ rootScope: options.scope }),
            PostHTMLMarkdown(),
            PostHTMLLorem()
        ]).process(content, {
            closingSingleTag: "default"
        }))
        let result = response.html

        /*  inline all referenced assets to be self-contained  */
        result = inlineAssets(this.resourcePath, this.resourcePath, result, {
            htmlmin: this.minimize,
            cssmin:  this.minimize,
            jsmin:   false,
            pattern: [ ".+" ],
            purge:   false
        })

        /*  remove leading and trailing comments as
            Vue expects a single top-level DOM element  */
        result = result
            .replace(/^(?:.|\n)*?(<[a-zA-Z_])/, "$1")
            .replace(/(?:[^>]|\n)*$/, "")

        /*  validate HTML template for Vue  */
        var warnings = vueValidator(result)
        if (warnings.length > 0)
            this.emitWarning("gemstone-loader-html: Vue [template-validator]: " +
                `WARNING:\n${warnings.join("\n")}`)

        /*  compile HTML template into a Vue rendering object  */
        let renderer = vueCompiler.compile(result)
        if (renderer.errors && renderer.errors.length > 0) {
            this.emitError("gemstone-loader-html: Vue [template-compiler]: " +
                `ERROR: ${renderer.errors.join("\n")}`)
            renderer = {
                render: "throw new Error(\"Vue template compilation already failed under build-time\")",
                staticRenderFns: []
            }
        }

        /*  export Vue rendering object as a JavaScript string  */
        const toFunction = (code) =>
            "function () { " + jsBeautify(code, { indent_size: 4 }) + " }"
        result = `module.exports = {
            render: ${toFunction(renderer.render)},
            staticRenderFns: [
                ${renderer.staticRenderFns.map(toFunction).join(",\n")}
            ]
        }`

        done(null, result)
    }.bind(this)).catch((err) => {
        this.emitError("gemstone-loader-html: ERROR: " + err)
        done(err)
    })
}

