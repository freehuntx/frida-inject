const FridaInject = require('../../index.js')

FridaInject({
  name: 'notepad++.exe',
  scripts: [
    'console.log("This is some basic injected script")',
    './inject'
  ],
  onAttach: session => console.log('Attached to process'),
  onDetach: (session, reason) => console.log('Detached from process'),
  onLoad: script => {
    console.log('Script loading')
    script.message.connect(message => {
      console.log('Message:', message)
    })
  },
  onUnload: script => console.log('Script unloaded')
})
