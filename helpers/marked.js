const marked = require('marked')
const hl = require('highlight.js')

marked.setOptions({
  highlight: function(code) {
    return hl.highlightAuto(code).value
  }
})

module.exports = function (text) {
  return marked(text)
}