# fixture

Call `parseArgs(argv)` to read flags.

```js
import { parseArgs, runServer } from './src/cli.js';
runServer(parseArgs(process.argv));
```

The CLI lives in `src/cli.js`.

Fetch releases from `releases/latest/download` on GitHub, or pin `download/v1.0.0`.
