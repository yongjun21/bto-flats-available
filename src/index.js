import fs from 'fs'
import fetch from 'node-fetch'
import {html2json} from 'html2json'
import csvStringify from 'csv-stringify/lib/sync'
import groupBy from 'lodash/groupBy'
import {FLAT_LIST, Cookie} from './constants'

const regulator = {
  delay: 100,
  tail: Promise.resolve(),
  push (fn, ...arg) {
    this.tail = this.tail
      .then(() => new Promise(resolve => {
        setTimeout(resolve, this.delay)
      }))
      .then(() => fn(...arg))
    return this.tail
  }
}

const apiCalls = Object.keys(FLAT_LIST).map(key => {
  const url = getUrl(...FLAT_LIST[key])
  const options = {headers: {'Accept-Encoding': 'gzip,deflate', Cookie}}
  return regulator.push(fetch, url, options)
    .then(res => res.text())
    .then(html => {
      return html
        .replace(/\r?\n|\r/g, '')
        .replace(/>\s+</g, '><')
        .match(/<body>(.*)<\/body>/)[0]
    })
    .then(html2json)
    .then(json => {
      const target = json.child[0]
        .child.filter(c => c.tag === 'form')[0]
        .child.filter(c => c.tag === 'div')[3].child[0]
        .child.filter(c => c.tag === 'div')[0]
        .child.filter(c => c.attr && c.attr.id === 'blockDetails')[0]
        .child.filter(c => c.tag === 'div')
      const matches = JSON.stringify(target)
        .match(/bookMarkCheck\('','#\d+-\d+'\)/g)
      return matches && matches.map(str => str.slice(19, str.length - 2))
    })
})

Promise.all(apiCalls)
  .then(results => {
    const booked = {}
    Object.keys(FLAT_LIST).forEach((block, i) => {
      if (!results[i]) return
      const byUnit = groupBy(results[i], unit => unit.split('-')[1])
      booked[block] = byUnit
    })
    return booked
  })
  .then(flatten)
  .then(arr => {
    const csv = csvStringify(arr, {header: true, columns: ['block', 'unit', 'noOfUnits', 'booked']})
    fs.writeFileSync('data/booked.csv', csv)
  })
  .catch(err => {
    console.error(err.stack)
  })

function getUrl (block, neighbourhood, contract) {
  return 'https://services2.hdb.gov.sg/webapp/BP13AWFlatAvail/BP13EBSFlatSearch?Town=Tampines&Flat_Type=BTO&selectedTown=Tampines&Flat=4-Room&ethnic=Y&ViewOption=2&projName=A&Block=' + block +
    '&DesType=A&EthnicA=Y&EthnicM=&EthnicC=&EthnicO=&numSPR=&dteBallot=201608&Neighbourhood=' + neighbourhood +
    '&Contract=' + contract + '&BonusFlats1=N&searchDetails=&brochure=false'
}

function flatten (obj) {
  const arr = []
  Object.keys(obj).forEach(block => {
    Object.keys(obj[block]).forEach(unit => {
      const booked = obj[block][unit].map(str => +str.split('-')[0])
      const noOfUnits = booked.length
      arr.push({block, unit, noOfUnits, booked: booked.join('/')})
    })
  })
  return arr
}
