# fixture

Call `parseArgs(argv)` to read flags.

```js
import { parseArgs, runServer } from './src/cli.js';
runServer(parseArgs(process.argv));
```

The CLI lives in `src/cli.js`.
