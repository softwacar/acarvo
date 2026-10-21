import { buildSeed } from './seed'
const t0 = Date.now()
const d = buildSeed(new Date())
console.log('seed ok in', Date.now() - t0, 'ms')
console.log({ vehicles: d.vehicles.length, customers: d.customers.length, reservations: d.reservations.length, rentals: d.rentals.length, charges: d.charges.length, payments: d.payments.length, events: d.events.length, tasks: d.tasks.length, approvals: d.approvals.length, size: JSON.stringify(d).length })
