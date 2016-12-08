'use strict'

/* global featureFile, scenarios, steps, before */

const Yadda = require('yadda')
const toposort = require('toposort')
const _filter = require('lodash/filter')
const _intersection = require('lodash/intersection')
const _difference = require('lodash/difference')
const _map = require('lodash/map')
Yadda.plugins.mocha.StepLevelPlugin.init()
const colors = require('colors')

function importLibrary (stepdefs, stepdef) {
  let fileName = stepdef.replace('.js', '')
  let library = require(fileName)
  return stepdefs.concat(library)
}

function run (app, featureFiles, featureLibraries) {
  const onlyFeatures = []
  const featureDependencies = []
  // Sort the features by @After annotation
  let featureGraph = _map(featureFiles, (f) => {
    let featureNameAndFile
    featureFile(f, (feature) => {
      let name = f.match(/\/([^/.]+)\.feature$/)
      featureNameAndFile = [feature.annotations.after, name[1]]
      featureDependencies.push([name[1], feature.annotations.after])
      if (feature.annotations.thisonly) {
        onlyFeatures.push(name[1])
        console.log(colors.green('[Yadda]', 'Marked as @thisonly:', name[1]))
      }
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

  if (onlyFeatures.length) {
    // Only run the features that are required by the features that have been marked with the @thisOnly annotation
    const featuresFilteredByOnly = []
    const addFilteredFeature = f => {
      featuresFilteredByOnly.push(f)
      _filter(featureDependencies, d => d[0] === f).map(d => {
        if (d[1] !== undefined) addFilteredFeature(d[1])
      })
    }
    _map(onlyFeatures, f => addFilteredFeature(f))
    console.log(colors.yellow('[Yadda]', 'Skipped features because they are not required by features marked as @thisonly:\n -', _difference(sortedFeatures, featuresFilteredByOnly).join('\n - ')))
    sortedFeatures = _intersection(sortedFeatures, featuresFilteredByOnly)
    console.log(colors.green('[Yadda]', 'Running features for @thisonly:\n -', sortedFeatures.join('\n - ')))
  }

  _map(sortedFeatures, (featureName) => {
    let file = _filter(featureFiles, (file) => {
      return new RegExp('/' + featureName + '.feature$').test(file)
    })[0]
    featureFile(file, (feature) => {
      if (feature.annotations.pending) {
        console.log(colors.yellow('[Yadda]', 'Skipped pending feature:', feature.title))
        return
      }
      scenarios(feature.scenarios, (scenario) => {
        before(() => {
          _map(beforeScenarioHooks, (hook) => {
            hook(context)
          })
        })
        if (scenario.annotations.pending) {
          console.log(colors.yellow('[Yadda]', 'Skipped pending scenario: ', scenario.title))
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
