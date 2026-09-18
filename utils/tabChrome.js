function syncCustomTabBar(page, selected) {
  if (typeof page.getTabBar === 'function' && page.getTabBar()) {
    page.getTabBar().setData({ selected: selected });
  }
}

function playTabEnter(page) {
  page.setData({ tabEnter: false });
  setTimeout(() => {
    page.setData({ tabEnter: true });
  }, 24);
}

function attachTabPage(page, selected) {
  syncCustomTabBar(page, selected);
  playTabEnter(page);
}

module.exports = {
  syncCustomTabBar,
  playTabEnter,
  attachTabPage
};
