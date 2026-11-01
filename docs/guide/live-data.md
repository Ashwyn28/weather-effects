# Day/night and live data

## Day and night

`night` selects the night look: stars and moon instead of sun glow. Pass it to `attachWeather` or `setWeather`. Leaving it out keeps the current value, initially `false`.

```js
weather.setWeather('clear', { night: true });
```

## Live readings

A [`WeatherReading`](/api/index/interfaces/WeatherReading) tunes the effects with real measurements. Missing or non-finite values fall back to the condition's defaults.

| Field           | Unit                                  |
| --------------- | ------------------------------------- |
| `windSpeed`     | km/h, clamped to 0–120                |
| `windGust`      | km/h, between `windSpeed` and 160     |
| `windDirection` | degrees the wind comes from (0 north) |
| `precipitation` | mm/h; scales particle density         |
| `cloudCover`    | percent, 0–100                        |

## Mapping WMO codes

Weather APIs report WMO weather codes. Mapping them to condition ids is the caller's job:

| WMO code       | Condition          |
| -------------- | ------------------ |
| 0              | `clear`            |
| 1              | `mainly-clear`     |
| 2              | `partly-cloudy`    |
| 3              | `overcast`         |
| 45, 48         | `fog`              |
| 51, 53, 55     | `drizzle`          |
| 56, 57         | `freezing-drizzle` |
| 61, 63, 65     | `rain`             |
| 66, 67         | `freezing-rain`    |
| 71, 73, 75, 77 | `snow`             |
| 80, 81, 82     | `showers`          |
| 85, 86         | `snow-showers`     |
| 95, 96, 99     | `thunderstorm`     |

`hail` and `wind` have no WMO code of their own; choose them yourself, for example `wind` when `wind_speed_10m` is high.

## Open-Meteo example

This snippet is type-checked in the test suite.

<<< @/snippets/wmo.ts
