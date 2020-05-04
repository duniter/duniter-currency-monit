# Currency-Monit Module

## Installation for developers

### Requirements

* Nodejs 9.x.x
* Python

### Dependencies and transpilation

    npm install -g yarn
    yarn
    
### First sync and start

Synchronize on a currency (for example Ğ1):

    node run.js sync g1.duniter.org
    
Then start currency-monit:

    node run.js currency-monit
    
> Tip: for development purposes you may not need the whole blockchain which is long to index. You can limit the sync to 1000 for example to speed up the process:
>
>     node run.js sync g1.duniter.org 1000

### Access

Then visit [http://localhost:10500](http://localhost:10500).
