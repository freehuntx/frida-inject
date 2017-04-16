const FridaInject = require('../../');

FridaInject('Target.exe', require.resolve('./inject'), {
  onAttach: function(session) {
    console.log('Attached to process');
  },
  onDetach: function(session) {
    console.log('Detached from process');
  },
  onScriptCreate: function(script) {
    console.log('Script created');
  },
  onLoad: function(script) {
    console.log('Script loaded');
  },
  onMessage: function(message, script) {
    console.log('Got message: ' + JSON.stringify(message));
  },
  onSend: function(payload, script) {
    console.log('Got send: ' + payload);
  },
  onError: function(error) {
    console.error(error);
  }
});

