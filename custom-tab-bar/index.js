Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '首页',
        iconPath: '/assets/tabbar/home.png',
        selectedIconPath: '/assets/tabbar/home.selected.png'
      },
      {
        pagePath: '/pages/review/index',
        text: '复习',
        iconPath: '/assets/tabbar/review.png',
        selectedIconPath: '/assets/tabbar/review.selected.png'
      },
      {
        pagePath: '/pages/library/index',
        text: '我的英语',
        iconPath: '/assets/tabbar/library.png',
        selectedIconPath: '/assets/tabbar/library.selected.png'
      }
    ]
  },

  methods: {
    onTap(event) {
      const index = Number(event.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item || index === this.data.selected) return;
      this.setData({ selected: index });
      wx.switchTab({ url: item.pagePath });
    }
  }
});
