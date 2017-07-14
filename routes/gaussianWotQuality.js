"use strict";

const co = require('co')

module.exports = (req, res, next) => co(function *() {
  
  var { duniterServer  } = req.app.locals
  
  try {
    // get GET parameters
    var format = req.query.format || 'HTML';
    
    // Si le client demande la réponse au format JSON, le faire
    if (format == 'JSON')
      res.status(200).jsonp( "[]" )
    else
    {
      // GET parameters
      
      res.locals = {
	    host: req.headers.host.toString(),
        form: ``,
        chart: {
          type: 'bar',
          data: {
            labels: ["1","2","3","4"],
            datasets: [{
              label: `#test`,
              data: [1,2,3,4],
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1
            }]
          },
          options: {
            title: {
              display: true,
              text: `titre`
            },
            legend: {
              display: false
            },
            scales: {
              yAxes: [{
                position: 'left'
              }]
            }
          }
        }
      }
      next()
    }
    
  } catch (e) {
    // En cas d'exception, afficher le message
    res.status(500).send(`<pre>${e.stack || e.message}</pre>`);
  }
})