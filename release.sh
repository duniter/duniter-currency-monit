#!/bin/bash

current=`grep -P "version\": \"\d+.\d+.\d+(\w*)" package.json | grep -oP "\d+.\d+.\d+(\w*)"`
echo "Current version: $current"

if [[ $1 =~ ^[0-9]+.[0-9]+.[0-9]+((a|b)[0-9]+)?$ ]]; then
  # Change the version in package.json and test file
  sed -i "s/version\": \"$current/version\": \"$1/g" package.json
  sed -i "s/$current/$1/g" package.json

  # Commit
  git reset HEAD
  git add package.json views/about.html
  git commit -m "v$1"
  git tag "v$1"
else
  echo "Wrong version format"
fi
