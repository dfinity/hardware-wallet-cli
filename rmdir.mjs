#!/usr/bin/env node

// SOURCE: https://github.com/peterpeterparker/create-ic/blob/main/rmdir.mjs
import {existsSync, rmSync} from 'fs';
import {join} from 'path';

const rmDir = () => {
  const dir = join(process.cwd(), 'dist');

  if (!existsSync(dir)) {
    return;
  }

  rmSync(dir, {recursive: true});
};

rmDir();