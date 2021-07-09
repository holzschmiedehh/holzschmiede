module.exports = function (slug, expected) {
  return slug === expected ? 'class="is-active"' : '';
}