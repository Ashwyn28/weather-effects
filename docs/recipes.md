# Recipes

Copy-paste components that mount `attachWeather` and destroy it on unmount. Each snippet is type-checked in the test suite.

## React

<<< @/snippets/react.tsx

## Vue

<<< @/snippets/vue.ts

## Svelte

A Svelte action keeps the lifecycle in one place:

<<< @/snippets/svelte.ts

```svelte
<script lang="ts">
  import { weather } from './weather';
</script>

<div use:weather={{ condition: 'rain', night: false }}>…</div>
```

## Plain HTML

A custom element works anywhere:

<<< @/snippets/plain.ts

```html
<weather-effect condition="snow" night></weather-effect>
```
