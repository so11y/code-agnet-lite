#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import {App} from './ui/App.js';
import {loadDotEnv} from './utils/env.js';

loadDotEnv(process.cwd());
render(<App cwd={process.argv.slice(2).join(' ') || process.cwd()} />);
