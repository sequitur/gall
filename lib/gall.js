#!/usr/bin/env node
'use strict';

import program from 'commander';
import path from 'path';
import fs from 'fs-jetpack';
// eslint-disable-next-line no-restricted-imports
import 'colors';
import pug from 'pug';
import less from 'less';
import chokidar from 'chokidar';

program
  .version('0.3.1');

program
  .command('new')
  .option('-f, --force', 'delete existing sources/ directory if any')
  .description('create a new project')
  .action(createNew);

program
  .command('build')
  .description('build the project in the current working directory')
  .action(build);

program
  .command('watch')
  .description('watch for changes in sources/ and queue up a build when it happens')
  .action(watch);

program
  .command('help')
  .description('show usage information')
  .action(() => program.outputHelp());

const SCAFFOLD_FILES = [
  'defines.json',
  'style.less',
  'template.pug',
  'script.js'
];

function createNew(options) {
  const scaffoldDir = path.join(__dirname, '../scaffold');
  const targetDir = path.join(process.cwd(), '/sources');
  if (fs.inspect(targetDir) && !options.force) {
    console.log('Sources directory already exists, aborting. Use --force to override and delete its contents.'.red);
    return;
  }
  console.log('Copying files into scaffold dir...'.green);
  fs.dir(targetDir, {empty: true});
  const promises = SCAFFOLD_FILES.map(filename => {
    const origin = path.join(scaffoldDir, filename);
    const target = path.join(targetDir, filename);
    return fs.copyAsync(origin, target)
      .then(() => console.log('\t', filename.yellow));
  });
  Promise.all(promises)
    .then(() => console.log('All done!'.green));
}

const REQUIRED_FILES = [
  'defines.json',
  'style.less',
  'template.pug',
  'script.js',
  'story.ink.json'
];

function build() {
  const sourceDir = path.join(process.cwd(), '/sources');
  function sourcePath(filename) {
    return path.join(sourceDir, filename);
  }
  const filesMissing = REQUIRED_FILES.reduce((missing, filename) => {
    const filepath = path.join(sourceDir, filename);
    if (fs.inspect(filepath)) {
      return missing;
    }
    missing.push(filename);
    return missing;
  }, []);
  if (filesMissing.length) {
    console.log('Error: Missing required source files'.red);
    filesMissing.forEach(filename => {
      console.log('\t', filename.red);
    });
  }
  console.log('Reading source files:'.green);
  const data = {};
  const promises = [];
  let template;
  promises.push(
    fs.readAsync(sourcePath('style.less'))
      .then(text => less.render(text))
      .then(output => {
        console.log('\tstyle.less'.yellow);
        data.css = output.css;
      })
  );

  function bomStrip(text) {
    /*
      Strip a byte-order mark from the head of the file. Inklecate generates
      those for compatibility with some other, mostly Windows-based, tools;
      but since inline JSON is not, technically speaking, a file, we want
      to strip it out before removing it.
    */
    if (text.charCodeAt(0) === 0xFEFF) {
      return text.slice(1);
    }
    return text;
  }

  promises.push(
    fs.readAsync(sourcePath('story.ink.json'))
      .then(text => {
        console.log('\tstory.ink.json'.yellow);
        data.story = bomStrip(text);
      })
  );
  promises.push(
    fs.readAsync(sourcePath('script.js'))
      .then(text => {
        console.log('\tscript.js'.yellow);
        data.script = text;
      })
  );
  promises.push(
    fs.readAsync(sourcePath('template.pug'))
      .then(text => {
        console.log('\ttemplate.pug'.yellow);
        template = text;
      })
  );
  promises.push(
    fs.readAsync(sourcePath('defines.json'), 'json')
      .then(json => {
        console.log('\tdefines.json'.yellow);
        data.defines = json;
      })
  );
  promises.push(
    fs.readAsync(path.join(__dirname, '../node_modules/ink-blotter/build/blotter.js'))
      .then(bundle => {
        console.log('\tblotter.js'.yellow);
        data.blotter = bundle;
      })
  );
  return Promise.all(promises)
    .then(() => {
      console.log('Writing output file...'.green);
      fs.write('out.html', pug.render(template, data));
    })
    .catch(err => {
      console.error('Error loading game data, ', err);
      throw err;
    });
}

function watch() {
  const sourceDir = path.join(process.cwd(), '/sources');
  const filesToWatch = REQUIRED_FILES
    .map(filename => path.join(sourceDir, filename));
  const watcher = chokidar.watch(filesToWatch, {persistent: true});
  let lock = false;
  watcher.on('change', () => {
    if (lock) {
      return;
    }
    lock = true;
    console.log(`Files changed on ${(new Date()).toLocaleString('en')}.`.yellow)
    console.log('Rebuilding...'.yellow);
    build().then(() => {
      lock = false;
    });
  });
  console.log('Watching sources/ for changes...'.blue);
}

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
