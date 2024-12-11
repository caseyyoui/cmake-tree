#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
const [major] = process.versions.node.split('.').map(Number)

if(major < 18)
{
  console.log(chalk.redBright("Error: must use node 18+"));
  process.exit(1);
}

const program = new Command();

program.version('0.0.1');

program.option('-d, --directory <DIRECTORY>', 'Directory', process.cwd());
program.option('-e, --exclude <FILTER>', 'Exclude regex', undefined);
program.option('-f, --filter <FILTER>', 'Variable filter', undefined);
program.option('-s, --simple', 'Skips printing uses and sets', undefined);
program.option('--ignore-temp', 'Ignore temp vars', false);

program.parse(process.argv);

//------------------------------------------------------------------

const opts = program.opts();

console.log(`Parsing ${opts.directory}...`);

var files = fs.readdirSync(opts.directory, {recursive: true});

files = files.filter((f) => /\.cmake|CMakeLists\.txt/.test(f) && !/build\/|_3rdParty|thirdparty\//.test(f));

if(opts.exclude !== undefined)
{
  files = files.filter((f) => !(new RegExp(opts.exclude)).test(f));
}

var activeDir = "";
function getColor(n)
{
  switch(n % 6)
  {
    case 0:
      return chalk.redBright;
    case 1:
      return chalk.magentaBright;
    case 2:
      return chalk.blueBright;
    case 3:
      return chalk.cyanBright;
    case 4:
      return chalk.greenBright;
    case 5:
      return chalk.yellowBright;
    default:
      return chalk.gray;
  }
}

function getColor1(n)
{
  switch(n % 3)
  {
    case 0:
      return chalk.redBright;
    case 1:
      return chalk.magentaBright;
    case 2:
      return chalk.yellowBright;
    default:
      return chalk.gray;
  }
}

function getColor2(n)
{
  switch(n % 3)
  {
    case 0:
      return chalk.blueBright;
    case 1:
      return chalk.cyanBright;
    case 2:
      return chalk.greenBright;
    default:
      return chalk.gray;
  }
}

function getColor3(n)
{
  switch(n % 3)
  {
    case 0:
      return chalk.bgBlueBright;
    case 1:
      return chalk.bgCyanBright;
    case 2:
      return chalk.bgGreenBright;
    default:
      return chalk.gray;
  }
}

var i = 0;
var color = getColor(i);

function getLastThreeDirectories(inputPath) {
  return inputPath;
  const normalizedPath = path.normalize(inputPath);
  const parts = normalizedPath.split(path.sep);
  const filteredParts = parts.filter(part => part);
  const lastThree = filteredParts.slice(-4);
  return lastThree.join(path.sep);
}

const groups = [
  //.*CmakeLists.txt', '\/apps\/.*Project.cmake', '\/apps\/.*SourceList.cmake'
  {name: "default", files: []},
  {paths: ["CMakeLists.txt"], name: "list files", files: []},
  {paths: ['\/apps\/|\/samples\/'], name: "apps", files: []},
  {paths: ["^cmake"], name: "cmake", files: []},
]

var variableGroups = {temp: {}, cmake: {}, variables:{}, options:{}};

function doGroupFile(g, f, v, val)
{
  if(g[v] === undefined)
    {
      g[v] = {files: [], filesUsed: []};
    }
    g[v].files.push({file: f, value: val});
}

function groupFile(f)
{
  var didPush = false;

  const data = fs.readFileSync(path.join(opts.directory, f), 'utf8')
  const matches = data.matchAll(/(set|option)\((\w*)\s{1}(.*)\)/g);
  
  for (const match of matches) {
    const t = match[1];
    const v = match[2];
    const val = match[3];

    if(v !== undefined && v !== "")
    {
      if(/^CMAKE/.test(v))
      {
        doGroupFile(variableGroups.cmake, f, v, val);
      }
      else if(v[0] === "_")
      {
        if(!opts.ignoreTemp)
        {
          doGroupFile(variableGroups.temp, f, v, val);
        }
      }
      else if(t === "option")
      {
        doGroupFile(variableGroups.options, f, v, val);
      }
      else
      {
        doGroupFile(variableGroups.variables, f, v, val);
      }
    }
  }

  for(const g of groups)
  {
    if(g.name === "default")
      continue;
    for(const p of g.paths)
    {
      const r = new RegExp(p);
      if(r.test(f))
      {
        g.files.push(f);
        return;
      }
    }
  }
  groups[0].files.push(f);
}

function updateGroup(d, g, f)
{
  Object.keys(g).map((v) => {
    var countSets = (d.match(new RegExp(`(set|option){0}\((${v})\s{1}(.*)\)`, 'g')) || []).length;

    var count = (d.match(new RegExp(v, 'g')) || []).length - countSets;

    if(count)
      g[v].filesUsed.push({file: f, count: count});
  });
  
}

// fills the filesUsed category
function updateGroups()
{
  files.map((f) => 
    {
      const data = fs.readFileSync(path.join(opts.directory, f), 'utf8')
      updateGroup(data, variableGroups.temp, f);
      updateGroup(data, variableGroups.cmake, f);
      updateGroup(data, variableGroups.options, f);
      updateGroup(data, variableGroups.variables, f);
    });
}

function makeGroups()
{
  files.map((f) => groupFile(f) );
  updateGroups();
}

function printDefault()
{
  files.map((f) => {
    var indent = "---";
    if(activeDir != path.dirname(f))
    {
      i = f.match(/\//g)?.length;
      color = getColor(i);
      activeDir = path.dirname(f);
      // console.log(color(`\n${activeDir}`));
    }

    const dir =  getLastThreeDirectories(path.dirname(f));
    while(f.includes('/'))
    {
      f = f.split('/').slice(1).join('/');
    }
    console.log(color(indent + "..." + dir+f));
  });
}

function printGroups(_groups)
{
  var i = 0;
  _groups.map((g) => 
    {
      var color = getColor(i++);
      if(g.name === "default")
          color = chalk.gray;
      console.log("\n" + color(g.name));
      g.files.map((f) => 
      {
        console.log(color(`----${(f)}`));
      });
    });
}

function colorVarInfo(str, isOption)
{
  if(isOption)
  {
    const matches = str.match(/("[^"]*")(.*)/);
    const description = matches[1];
    const variable = matches[2];
    return chalk.gray(description) + chalk.cyan(variable);
  }
  else
  {
    let v = "";
    let d = "";
    let hasVariable = false;
    let isQuote = false;
    for(var i = 0; i < str.length; i++)
    {
      var c = str[i];

      if(i === 1 && c === '"')
      {
        isQuote = true;
      }

      if(isQuote && str[i-1] === '"' && i > 2)
        hasVariable = true;
      else if(!isQuote && c === " " && i != 0)
        hasVariable = true;
      if(!hasVariable)
        v+=c;
      else
        d+=c;
    }
    return chalk.cyan(v)+chalk.gray(d);
  }
}

function printVars()
{
  var c = 0;
  Object.keys(variableGroups).map((k) => 
  {
    const g = variableGroups[k];
    var gc = getColor1;
    if(k === "cmake")
      gc = getColor3;
    if(k === "options")
      gc = getColor2;
    var color = gc(c);
    if(k === "temp")
      color = chalk.gray;
    console.log(color("\n------------------------------------------------------------------------\n------------------------------------------------------------------------"));
    console.log(color("-------------------------------" + k + ":"));
    console.log(color("------------------------------------------------------------------------\n------------------------------------------------------------------------\n"));

    Object.keys(g).map((vk) => 
    {
      if(opts.filter !== undefined && !(new RegExp(opts.filter).test(vk)))
        return;

      color = gc(++c);
      const v = g[vk];

      if(k === "temp")
        color = chalk.white;
      console.log(color(`--- ${vk}:`))
      if(!opts.simple)
      {
        console.log(chalk.gray(`----- sets:`))
        if(k === "temp")
          color = chalk.gray;
        v.files.map((f) => 
          {
            console.log(color(`------< ${(getLastThreeDirectories(f.file))}:`) + colorVarInfo(` ${f.value}`, k === "options"));
          });
        
        console.log(chalk.gray(`----- uses:`))
        v.filesUsed.map((f) => 
          {
            console.log(color(`------> ${(getLastThreeDirectories(f.file))}:`) +  chalk.gray(' used ') + chalk.cyan(f.count) + chalk.gray(' times'));
          });
      }
    });
  });
}

makeGroups();
//printDefault();
//printGroups(groups.reverse());
printVars();

