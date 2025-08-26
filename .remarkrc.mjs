export default {
  plugins: [
    ['remark-frontmatter', 'yaml', '-'],
    'remark-preset-lint-consistent',
    'remark-preset-lint-recommended',
    ['remark-lint-list-item-indent', 'one'],
    ['remark-lint-unordered-list-marker-style', 'consistent'],
  ],
};
