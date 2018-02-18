const FridaInject = require('../../src/FridaInject')

let notepad = new FridaInject('notepad++.exe')
  .on('error', err => console.error(err))
  .on('attach', () => {
    console.log('Attached to process')
  })
  .on('detach', () => {
    console.log('Detached from process')
  })
  .on('load', script => {
    console.log('Script loaded')
  })
  .on('send', msg => {
    console.log('Got send:', msg)
  })
  .on('message', msg => {
    console.log('Got message:', JSON.stringify(message))
  })

notepad.load('console.log("This is some basic injected script")')
notepad.load(`${__dirname}/inject`)
