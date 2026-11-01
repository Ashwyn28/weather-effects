# Conditions

There are 15 conditions. Pass any of them to `attachWeather({ condition })` or
`setWeather(condition)`. Changing condition eases between the two over about a second and a half.
The `CONDITIONS` array lists every id and `isCondition(value)` checks untrusted input, such as an API response.

```js
import { CONDITIONS, isCondition } from 'weather-effects';

CONDITIONS.length; // 15
isCondition('rain'); // true
```

Mapping weather data (for example WMO codes) onto these ids is covered in [Day/night and live data](/guide/live-data).

## `clear`

Clear sky.

![clear](../assets/conditions/clear.png)

## `mainly-clear`

Mostly clear, a few thin clouds.

![mainly-clear](../assets/conditions/mainly-clear.png)

## `partly-cloudy`

Broken clouds with sun or moon showing through.

![partly-cloudy](../assets/conditions/partly-cloudy.png)

## `overcast`

Full cloud cover.

![overcast](../assets/conditions/overcast.png)

## `fog`

Fog drifting over the page.

![fog](../assets/conditions/fog.png)

## `drizzle`

Light, fine rain.

![drizzle](../assets/conditions/drizzle.png)

## `freezing-drizzle`

Fine drizzle that freezes on contact.

![freezing-drizzle](../assets/conditions/freezing-drizzle.png)

## `rain`

Steady rain with splashes on surfaces.

![rain](../assets/conditions/rain.png)

## `freezing-rain`

Rain falling as ice.

![freezing-rain](../assets/conditions/freezing-rain.png)

## `showers`

Heavier, shorter bursts of rain.

![showers](../assets/conditions/showers.png)

## `snow`

Snowfall that settles on surfaces.

![snow](../assets/conditions/snow.png)

## `snow-showers`

Heavier bursts of snow.

![snow-showers](../assets/conditions/snow-showers.png)

## `thunderstorm`

Heavy rain with lightning.

![thunderstorm](../assets/conditions/thunderstorm.png)

## `hail`

Hailstones that bounce off surfaces.

![hail](../assets/conditions/hail.png)

## `wind`

Windblown leaves and gusts.

![wind](../assets/conditions/wind.png)
