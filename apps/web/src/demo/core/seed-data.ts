import { B } from '../i18n'
import { nextId, nextNo } from './helpers'
import type { Customer, Db, DemoDocument } from './types'

export interface DbSeedCtx {
  d: Db
  T: (off: number, hm?: string, zone?: string) => string
  today: string
}

// name, country, dob, licence issued year, language, licence valid-until offset in days (from today)
type Row = [string, string, string, number, 'tr' | 'en' | 'bs', number]

const MAIN: Row[] = [
  ['Ajla Testović', 'BA', '1990-04-12', 2010, 'bs', 900],
  ['Mirza Uzorak', 'BA', '1985-09-03', 2005, 'bs', 1500],
  ['Lejla Demić', 'BA', '1992-01-21', 2012, 'bs', 1100],
  ['Emir Primjerović', 'BA', '1978-11-30', 1998, 'bs', 700],
  ['Selma Kovač', 'BA', '1995-06-18', 2015, 'bs', 1300],
  ['Tarik Testić', 'BA', '1988-02-09', 2008, 'bs', 800],
  ['Lena Beispiel', 'DE', '1991-07-25', 2011, 'en', 1700],
  ['Hans Müller-Demo', 'DE', '1975-03-14', 1995, 'en', -1], // licence expired yesterday
  ['Sarah Example', 'GB', '1989-12-02', 2009, 'en', 1200],
  ['James Sample', 'US', '1983-05-27', 2003, 'en', 2000],
  ['Ana Horvat', 'HR', '1994-08-19', 2013, 'bs', 950],
  ['Ivan Kovačić', 'HR', '1986-08-08', 2006, 'bs', 1400],
  ['Marko Petrović', 'RS', '1994-10-10', 2014, 'bs', 1000],
  ['Jelena Nikolić', 'RS', '1990-03-03', 2010, 'bs', 600],
  ['Mehmet Örnek', 'TR', '1982-04-15', 2002, 'tr', 1800],
  ['Elif Deneme', 'TR', '1996-09-30', 2016, 'tr', 5], // licence ends in 5 days
  ['Anna Kowalska', 'PL', '1993-01-19', 2013, 'en', 1250],
  ['Luca Rossi-Demo', 'IT', '1987-06-06', 2007, 'en', 1500],
  ['Nina Mock', 'BA', '1999-12-12', 2019, 'bs', 1600],
  ['Dino Fiktiv', 'BA', '2003-05-05', 2022, 'bs', 1900], // young driver
  ['Maja Beispiel', 'BA', '1997-02-27', 2016, 'bs', 1350],
  ['Kenan Demo', 'BA', '1991-10-01', 2011, 'bs', 1050],
  ['Petra Novak-Demo', 'HR', '1992-07-07', 2012, 'bs', 880],
  ['Goran Primjer', 'BA', '1980-12-24', 2000, 'bs', 760],
  ['Ivana Demo', 'HR', '1998-04-04', 2017, 'bs', 1450],
  ['Samir Test', 'BA', '1989-09-09', 2009, 'bs', 1020],
  ['Amra Fiktiv', 'BA', '1993-11-11', 2013, 'bs', 1110],
  ['Kim Missing-Demo', 'KR', '1990-01-15', 2010, 'en', 1300], // passport missing
]

const GIVEN = ['Edin', 'Amela', 'Zoran', 'Vesna', 'Nermin', 'Tijana', 'Darko', 'Lana', 'Sead', 'Mira', 'Faruk', 'Dina']
const FAMILY = ['Demirović', 'Babić', 'Horvat-Demo', 'Zukić', 'Marić', 'Softić', 'Tomić', 'Begić-Demo', 'Jukić', 'Ramić', 'Kurtović', 'Lukić']

export function customersData({ d, T }: DbSeedCtx): Customer[] {
  const rows: Row[] = [...MAIN]
  for (let i = 0; i < GIVEN.length; i++) rows.push([`${GIVEN[i]} ${FAMILY[i]}`, i % 4 === 0 ? 'HR' : 'BA', `${1975 + ((i * 3) % 25)}-0${(i % 9) + 1}-1${i % 9}`, 2000 + ((i * 2) % 20), 'bs', 700 + i * 55])
  rows.push(['Selma Hodžić-Demo', 'BA', '1990-05-18', 2010, 'bs', 1300]) // advance (kaparo) story: appended last so earlier customer numbers stay the same
  const out: Customer[] = []
  const ymd = (off: number) => T(off, '12:00').slice(0, 10)
  rows.forEach(([name, country, dob, licYear, lang, licOff], i) => {
    const foreign = country !== 'BA'
    const c: Customer = {
      id: nextId(d, 'c'),
      no: nextNo(d, 'M'),
      name,
      kind: 'individual',
      phone: `+387 61 000 ${String(100 + i).padStart(3, '0')}`,
      email: `${name.split(' ')[0]!.toLowerCase().replace(/[^a-z]/g, '')}${i + 1}@example.test`,
      country,
      residency: foreign ? 'foreign' : 'local',
      dob,
      language: lang,
      license: { issuedYear: licYear, validUntil: ymd(licOff), categories: ['B'] },
      contactPref: i % 3 === 0 ? 'email' : 'phone',
      notes: [],
      restrictions: [],
      contacts: [],
      createdAt: T(-300 + i * 3, '10:00'),
      archived: false,
      gdpr: { requests: [] },
    }
    out.push(c)
    d.customers.push(c)
    const doc = (kind: string, validOff: number | null, name2: string): void => {
      const x: DemoDocument = { id: nextId(d, 'doc'), ownerType: 'customer', ownerId: c.id, kind, name: B(`${name2} (örnek belge, gerçek kişi verisi değil)`, `${name2} (sample document, not real personal data)`), version: 1, validUntil: validOff === null ? undefined : ymd(validOff), placeholder: true, uploadedAt: T(-200, '10:00'), uploadedBy: 'u-ops1' }
      d.documents.push(x)
    }
    // Missing passport on purpose for "Kim Missing-Demo" (index 28) to show the document gate.
    if (name.startsWith('Kim Missing')) {
      doc('driving_license', licOff, B('Sürücü belgesi', 'Driving licence'))
      return
    }
    if (foreign) doc('passport', 2000 + i * 10, 'Pasaport')
    else doc('national_id', 1500 + i * 12, B('Kimlik kartı', 'ID card'))
    doc('driving_license', licOff, B('Sürücü belgesi', 'Driving licence'))
  })
  // A few notes, restrictions and contact logs for the 360° view
  const c1 = out[0]!
  c1.notes.push({ id: nextId(d, 'nt'), at: T(-60, '10:00'), by: 'u-ops1', text: B('Sadık müşteri. Otomatik vitesi tercih ediyor.', 'Loyal customer. Prefers an automatic gearbox.'), pinned: true })
  c1.contacts.push({ id: nextId(d, 'cl'), at: T(-12, '11:00'), by: 'u-ops1', channel: 'phone', summary: B('Hafta sonu için rezervasyon sordu; fiyat bilgisi verildi (telefonla).', 'Asked about a weekend reservation; price information was given (by phone).'), followUpAt: T(1, '10:00'), followUpDone: false })
  const c6 = out[5]!
  c6.restrictions.push({ id: nextId(d, 'rs'), label: B('Önceki kiralamada geç iade', 'Late return on the previous rental'), reason: B('Son iki kiralamada iade 5 saatten fazla gecikti: teslimde iletişim bilgileri tekrar doğrulanır.', 'The return was more than 5 hours late on the last two rentals: contact details are re-verified at handover.'), at: T(-40, '10:00'), by: 'u-mgr' })
  const c8 = out[7]!
  c8.notes.push({ id: nextId(d, 'nt'), at: T(-30, '10:00'), by: 'u-mgr', text: B('Sürücü belgesi yenileme sürecinde; yeni belge gelmeden kiralama yapılamaz.', 'The driving licence is being renewed; no rental can be made until the new document arrives.'), pinned: true })
  return out
}
