import {Underscore} from 'duniter/app/lib/common-libs/underscore'

export function getMicrosecondsTime() {
  const [ seconds, nanoseconds ] = process.hrtime()
  return seconds * 1000000 + nanoseconds / 1000
}

export function getDurationInMicroSeconds(before:number) {
  return parseInt(String(getMicrosecondsTime() - before))
}

const monitorings: {
  [k: string]: {
    times: {
      time: number
    }[]
  }
} = {}

export const showExecutionTimes = () => {
  let traces: { name: string, times: number, avg: number, total: number }[] = []
  Object
    .keys(monitorings)
    .forEach(k => {
      const m = monitorings[k]
      const total = m.times.reduce((s, t) => s + t.time / 1000, 0)
      const avg = m.times.length ? total / m.times.length : 0
      traces.push({
        name: k,
        times: m.times.length,
        avg,
        total
      })
    })
  traces = Underscore.sortBy(traces, t => t.total)
  traces
    .forEach(t => {
      console.log('%s %s times %sms (average) %sms (total time)',
        (t.name + ':').padEnd(50, ' '),
        String(t.times).padStart(10, ' '),
        t.avg.toFixed(3).padStart(10, ' '),
        t.total.toFixed(0).padStart(10, ' ')
      )
    })
}

export const MonitorExecutionTime = function (idProperty?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    if (process.argv.includes('--monitor')) {
      const original = descriptor.value
      if (original.__proto__.constructor.name === "AsyncFunction") {
        descriptor.value = async function (...args: any[]) {
          const start = getMicrosecondsTime()
          const entities: any[] = await original.apply(this, args)
          const duration = getDurationInMicroSeconds(start)
          const k = target.constructor.name + '.' + propertyKey + (idProperty ? `[${(this as any)[idProperty]}]` : '')
          if (!monitorings[k]) {
            monitorings[k] = {
              times: []
            }
          }
          monitorings[k].times.push({
            time: duration
          })
          return entities
        }
      } else {
        descriptor.value = function (...args: any[]) {
          const start = getMicrosecondsTime()
          const entities: any[] = original.apply(this, args)
          const duration = getDurationInMicroSeconds(start)
          const k = target.constructor.name + '.' + propertyKey + (idProperty ? `[${(this as any)[idProperty]}]` : '')
          if (!monitorings[k]) {
            monitorings[k] = {
              times: []
            }
          }
          monitorings[k].times.push({
            time: duration
          })
          return entities
        }
      }
    }
  }
}
