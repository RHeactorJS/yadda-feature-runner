'use strict'

/* global featureFile, scenarios, steps, before */

const Yadda = require('yadda')
const toposort = require('toposort')
const _filter = require('lodash/filter')
const _map = require('lodash/map')
Yadda.plugins.mocha.StepLevelPlugin.init()

function importLibrary (stepdefs, stepdef) {
  let fileName = stepdef.replace('.js', '')
  let library = require(fileName)
  return stepdefs.concat(library)
}

function run (app, featureFiles, featureLibraries) {
  // Sort the features by @After annotation
  let featureGraph = _map(featureFiles, (f) => {
    let featureNameAndFile
    featureFile(f, (feature) => {
      let name = f.match(/\/([^/.]+)\.feature$/)
      featureNameAndFile = [feature.annotations.after, name[1]]
    })
    return featureNameAndFile
  })

  let sortedFeatures = _filter(toposort(featureGraph), (feature) => {
    return feature !== undefined
  })

  // Init Yadda
  let context = {
    $app: app
  }
  let stepDefs = featureLibraries.reduce(importLibrary, [])
  let y = new Yadda.Yadda(_map(stepDefs, (def) => {
    return def.library
  }), {
    ctx: context
  })
  let beforeScenarioHooks = _filter(_map(stepDefs, (def) => {
    return def.beforeScenario
  }), (hook) => {
    return hook !== undefined
  })
  _map(sortedFeatures, (featureName) => {
    let file = _filter(featureFiles, (file) => {
      return new RegExp('/' + featureName + '.feature$').test(file)
    })[0]
    featureFile(file, (feature) => {
      if (feature.annotations.pending) {
        console.log('Skipped pending feature: ' + feature.title)
        return
      }
      scenarios(feature.scenarios, (scenario) => {
        before(() => {
          _map(beforeScenarioHooks, (hook) => {
            hook(context)
          })
        })
        if (scenario.annotations.pending) {
          console.log('Skipped pending scenario: ' + scenario.title)
          return
        }
        steps(scenario.steps, (step, done) => {
          y.run(step, done)
        })
      })
    })
  })
}

module.exports = (app) => {
  return {
    run: run.bind(null, app)
  }
}
