/**
     * Compute colors scale
     * @param count
     * @param opacity
     * @param startColor
     * @param startState
     * @returns {Array}
     */
module.exports = function colorScale(count, opacity, startColor, startState) {

      function _state2side(state) {
        switch(state) {
          case 0:
            return 0;
          case 1:
            return -1;
          case 2:
            return 0;
          case 3:
            return 1;
        }
      }

      // From [0,1]
      opacity = opacity || '0.55';

      var defaultStateSize = Math.round(count / 2.5/*=4 states max*/);

      // Start color [r,v,b]
      var color = startColor ? angular.copy(startColor) : [255,0,0]; // Red

      // Colors state: 0=keep, 1=decrease, 2=keep, 3=increase
      var states = startState ? angular.copy(startState) : [0,2,3]; // R=keep, V=keep, B=increase

      var steps = startColor ? [
        Math.round(255 / defaultStateSize),
        Math.round(255 / defaultStateSize),
        Math.round(255 / defaultStateSize)
      ] : [
        Math.round((color[0]-50) / defaultStateSize),
        Math.round((255-color[1]) / defaultStateSize),
        Math.round((255-color[2]) / defaultStateSize)
      ];


      // Compute start sides (1=increase, 0=flat, -1=decrease)
      var sides = [
        _state2side(states[0]),
        _state2side(states[1]),
        _state2side(states[2])];

      // Use to detect when need to change a 'flat' state (when state = 0 or 2)
      var stateCounters  = [0,0,0];

      var result = [];
      for (var i = 0; i<count; i++) {
        for (var j=0; j<3;j++) {
          color[j] +=  sides[j] * steps[j];
          stateCounters[j]++;
          // color has reach a limit
          if (((color[j] <= 0 || color[j] >= 255) && sides[j] !== 0) ||
            (sides[j] === 0 && stateCounters[j] == defaultStateSize)) {
            // Max sure not overflow limit
            if (color[j] <= 0) {
              color[j] = 0;
            }
            else if (color[j] >= 255) {
              color[j] = 255;
            }
            // Go to the next state, in [0..3]
            states[j] = (states[j] + 1) % 4;

            // Update side from this new state
            sides[j] = _state2side(states[j]);

            // Reset state counter
            stateCounters[j] = 0;
          }
        }

        // Add the color to result
        result.push('rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ',' + opacity+')');

      }
      return result;
    }