import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'weather-effects',
  description: 'Rain, snow, hail, fog and clouds for your web page.',
  base: '/weather-effects/',
  outDir: '../site',
  cleanUrls: true,
  // Fail the build on any broken internal link.
  ignoreDeadLinks: false,
  // Only guides and recipes are pages; repo files at the root are not.
  srcExclude: ['snippets/**'],
  head: [['link', { rel: 'icon', href: '/weather-effects/assets/hero.png' }]],
  themeConfig: {
    search: { provider: 'local' },
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'Live demo', link: 'https://ashwyn28.github.io/weather-effects/demo.html' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting started', link: '/getting-started' },
          { text: 'How it works', link: '/how-it-works' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'Conditions', link: '/guide/conditions' },
          { text: 'Surfaces and collisions', link: '/guide/surfaces' },
          { text: 'Clouds, sky and backdrop', link: '/guide/backdrop' },
          { text: 'Drops on glass', link: '/guide/glass' },
          { text: 'Day/night and live data', link: '/guide/live-data' },
          { text: 'Performance', link: '/guide/performance' },
          { text: 'Accessibility', link: '/guide/accessibility' },
          { text: 'Low-level API', link: '/guide/low-level' },
        ],
      },
      { text: 'Recipes', items: [{ text: 'Frameworks', link: '/recipes' }] },
      {
        text: 'API reference',
        items: [
          { text: 'Overview', link: '/api/' },
          { text: 'weather-effects', link: '/api/index/' },
          { text: 'weather-effects/advanced', link: '/api/advanced/' },
        ],
      },
      { text: 'Changelog', link: '/changelog' },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/Ashwyn28/weather-effects' }],
  },
});
