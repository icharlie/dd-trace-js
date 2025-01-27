'use strict'

const axios = require('axios')
const getPort = require('get-port')
const { execSync } = require('child_process')
const { parse } = require('url')
const agent = require('../../dd-trace/test/plugins/agent')
const plugin = require('../src')

wrapIt()

describe('Plugin', function () {
  this.timeout(30000) // Webpack builds on every test run

  let next
  let app
  let listener
  let port

  describe('next', () => {
    withVersions(plugin, 'next', version => {
      const setup = config => {
        before(() => {
          return agent.load('next', config)
        })

        after(() => {
          listener.close()
          return agent.close()
        })

        before(async () => {
          const { createServer } = require('http')

          // building in-process makes tests fail for an unknown reason
          execSync('node build', {
            cwd: __dirname,
            env: { version },
            stdio: ['pipe', 'ignore', 'pipe']
          })

          next = require(`../../../versions/next@${version}`).get()
          app = next({ dir: __dirname, dev: false, quiet: true })

          const handle = app.getRequestHandler()

          await app.prepare()

          listener = createServer((req, res) => {
            const parsedUrl = parse(req.url, true)

            handle(req, res, parsedUrl)
          })
        })

        before(done => {
          getPort()
            .then(_port => {
              port = _port
              listener.listen(port, 'localhost', () => done())
            })
        })
      }

      describe('without configuration', () => {
        setup()

        describe('for api routes', () => {
          it('should do automatic instrumentation', done => {
            agent
              .use(traces => {
                const spans = traces[0]

                expect(spans[0]).to.have.property('name', 'next.request')
                expect(spans[0]).to.have.property('service', 'test-next')
                expect(spans[0]).to.have.property('type', 'web')
                expect(spans[0]).to.have.property('resource', 'GET /api/hello/[name]')
                expect(spans[0].meta).to.have.property('span.kind', 'server')
                expect(spans[0].meta).to.have.property('http.method', 'GET')
                expect(spans[0].meta).to.have.property('http.status_code', '200')
              })
              .then(done)
              .catch(done)

            axios
              .get(`http://localhost:${port}/api/hello/world`)
              .catch(done)
          })

          it('should propagate context', done => {
            axios
              .get(`http://localhost:${port}/api/hello/world`)
              .then(res => {
                expect(res.data.name).to.equal('next.request')
                done()
              })
              .catch(done)
          })

          it('should handle routes not found', done => {
            agent
              .use(traces => {
                const spans = traces[0]

                expect(spans[0]).to.have.property('name', 'next.request')
                expect(spans[0]).to.have.property('service', 'test-next')
                expect(spans[0]).to.have.property('type', 'web')
                expect(spans[0]).to.have.property('resource', 'GET /404')
                expect(spans[0].meta).to.have.property('span.kind', 'server')
                expect(spans[0].meta).to.have.property('http.method', 'GET')
                expect(spans[0].meta).to.have.property('http.status_code', '404')
              })
              .then(done)
              .catch(done)

            axios
              .get(`http://localhost:${port}/api/missing`)
              .catch(() => {})
          })
        })

        describe('for pages', () => {
          it('should do automatic instrumentation', done => {
            agent
              .use(traces => {
                const spans = traces[0]

                expect(spans[0]).to.have.property('name', 'next.request')
                expect(spans[0]).to.have.property('service', 'test-next')
                expect(spans[0]).to.have.property('type', 'web')
                expect(spans[0]).to.have.property('resource', 'GET /hello/[name]')
                expect(spans[0].meta).to.have.property('span.kind', 'server')
                expect(spans[0].meta).to.have.property('http.method', 'GET')
                expect(spans[0].meta).to.have.property('http.status_code', '200')
              })
              .then(done)
              .catch(done)

            axios
              .get(`http://localhost:${port}/hello/world`)
              .catch(done)
          })

          it('should handle pages not found', done => {
            agent
              .use(traces => {
                const spans = traces[0]

                expect(spans[0]).to.have.property('name', 'next.request')
                expect(spans[0]).to.have.property('service', 'test-next')
                expect(spans[0]).to.have.property('type', 'web')
                expect(spans[0]).to.have.property('resource', 'GET /404')
                expect(spans[0].meta).to.have.property('span.kind', 'server')
                expect(spans[0].meta).to.have.property('http.method', 'GET')
                expect(spans[0].meta).to.have.property('http.status_code', '404')
              })
              .then(done)
              .catch(done)

            axios
              .get(`http://localhost:${port}/missing`)
              .catch(() => {})
          })
        })
      })

      describe('with configuration', () => {
        const config = {}

        before(() => {
          config.hooks = {
            request: sinon.spy()
          }
        })

        setup(config)

        it('should execute the hook', done => {
          agent
            .use(traces => {
              const spans = traces[0]

              expect(spans[0]).to.have.property('name', 'next.request')
              expect(spans[0]).to.have.property('service', 'test-next')
              expect(spans[0]).to.have.property('type', 'web')
              expect(spans[0]).to.have.property('resource', 'GET /api/hello/[name]')
              expect(spans[0].meta).to.have.property('span.kind', 'server')
              expect(spans[0].meta).to.have.property('http.method', 'GET')
              expect(spans[0].meta).to.have.property('http.status_code', '200')
            })
            .then(done)
            .catch(done)

          axios
            .get(`http://localhost:${port}/api/hello/world`)
            .catch(done)
        })
      })
    })
  })
})
