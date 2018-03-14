# Currency-Monit Module

Requires Duniter 1.6.22 or higher

## Installation

**Warning: only tar.gz format works ! Don't use zip format.**

### If you use web-ui, install it very easy:

1. go to localhost:9220/#/main/settings/modules
and at the foot of page enter:
```bash
<<<<<<< HEAD
https://github.com/duniter/duniter-currency-monit/archive/0.3.7.tar.gz
=======
duniter-currency-monit@0.4.5
>>>>>>> dev2
```

then clik to button INSTALL THIS MODULE

2. restart your duniter node

### If you don't use web-ui:

1. download and uncompress archive at the location of your choice
2. plug the plugin to your duniter node:

```bash
<<<<<<< HEAD
duniter plug https://github.com/duniter/duniter-currency-monit/archive/0.3.7.tar.gz
=======
duniter plug duniter-currency-monit@0.4.5
>>>>>>> dev2
```

3. Stop your duniter node and restart it in the following method:
```bash
duniter currency-monit [host] [port]
```

then visit `host:port` (default is `localhost:10500`)