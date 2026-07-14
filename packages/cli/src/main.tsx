#!/usr/bin/env node
import {render} from 'ink';
import {loadDotEnv} from '@code-agent-lite/platform';
import {App} from './ui/App.js';

loadDotEnv(process.cwd());
render(<App cwd={process.argv.slice(2).join(' ') || process.cwd()} />);
