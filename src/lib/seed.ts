import { doc, setDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Optional demo seeding so the panel isn't empty on a fresh project. Everything
 * created here is prefixed `demo_` and carries `demo: true` so it can be wiped.
 * Master-only, triggered from Settings — never runs automatically.
 */

const SP = { lat: -23.5505, lng: -46.6333 };
function near(d = 0.06) {
  return { lat: SP.lat + (Math.random() - 0.5) * d, lng: SP.lng + (Math.random() - 0.5) * d };
}
function daysAgo(n: number) {
  return Timestamp.fromMillis(Date.now() - n * 86400000 - Math.random() * 86400000);
}

const STORES = [
  { id: 'demo_store_1', name: 'Mercado Vila Verde', cnpj: '12345678000190' },
  { id: 'demo_store_2', name: 'SuperBox Express', cnpj: '98765432000110' },
];
const DRIVERS = [
  { id: 'demo_driver_1', name: 'João Pereira', approvalStatus: 'pending', status: 'offline' },
  { id: 'demo_driver_2', name: 'Marcos Lima', approvalStatus: 'approved', status: 'online' },
  { id: 'demo_driver_3', name: 'Ana Souza', approvalStatus: 'approved', status: 'on_delivery' },
  { id: 'demo_driver_4', name: 'Carlos Dias', approvalStatus: 'pending', status: 'offline' },
];
const CUSTOMERS = [
  { id: 'demo_cust_1', name: 'Beatriz Antunes' },
  { id: 'demo_cust_2', name: 'Rafael Gomes' },
  { id: 'demo_cust_3', name: 'Patrícia Nunes' },
];

export async function seedDemoData(onProgress?: (msg: string) => void) {
  const log = (m: string) => onProgress?.(m);

  for (const s of STORES) {
    await setDoc(doc(db, 'supermarkets', s.id), {
      name: s.name,
      cnpj: s.cnpj,
      ownerId: 'demo',
      themeColor: '#58CC02',
      logoUrl: '',
      active: true,
      approvalStatus: 'approved',
      rating: 4.4 + Math.random() * 0.5,
      location: near(),
      address: 'Av. Paulista, São Paulo - SP',
      fees: { commissionPct: 12, fixedFee: 0.99 },
      demo: true,
      createdAt: daysAgo(120),
      updatedAt: serverTimestamp(),
    });
  }
  log('Lojas criadas');

  for (const d of DRIVERS) {
    await setDoc(doc(db, 'drivers', d.id), {
      name: d.name,
      email: `${d.id}@demo.nexmarket.app`,
      phone: '11999990000',
      cpf: String(10000000000 + Math.floor(Math.random() * 8999999999)),
      status: d.status,
      approvalStatus: d.approvalStatus,
      vehicle: { type: 'moto', plate: 'ABC1D23', model: 'Honda CG 160' },
      documents: {
        status: d.approvalStatus === 'approved' ? 'approved' : 'pending',
        cnhUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=900',
        vehicleDocUrl: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=900',
        profilePhotoUrl: 'https://i.pravatar.cc/300?u=' + d.id,
        proofOfResidenceUrl: 'https://images.unsplash.com/photo-1568234928966-359c35dd8327?w=900',
        backgroundCheck: { status: d.approvalStatus === 'approved' ? 'clear' : 'pending' },
      },
      bank: { pixKey: `${d.id}@demo`, holderName: d.name },
      location: near(),
      rating: 4.3 + Math.random() * 0.6,
      totalDeliveries: Math.floor(Math.random() * 800),
      balance: Math.round(Math.random() * 400 * 100) / 100,
      demo: true,
      createdAt: daysAgo(90),
      updatedAt: serverTimestamp(),
    });
  }
  // a pending payout to review
  await setDoc(doc(db, 'drivers/demo_driver_2/payouts/demo_payout_1'), {
    amount: 180.5,
    method: 'PIX',
    destination: 'demo_driver_2@demo',
    status: 'requested',
    demo: true,
    createdAt: daysAgo(1),
    updatedAt: serverTimestamp(),
  });
  log('Entregadores criados');

  for (const c of CUSTOMERS) {
    await setDoc(doc(db, 'customers', c.id), {
      name: c.name,
      email: `${c.id}@demo.app`,
      phone: '11988887777',
      cpf: String(20000000000 + Math.floor(Math.random() * 7999999999)),
      demo: true,
      createdAt: daysAgo(60),
      updatedAt: serverTimestamp(),
    });
  }
  log('Clientes criados');

  const statuses = ['delivered', 'delivered', 'delivered', 'picking', 'ready', 'cancelled'];
  const pays = ['pix', 'card_online', 'cash_delivery'];
  let n = 0;
  for (let i = 0; i < 24; i++) {
    const store = STORES[i % STORES.length];
    const cust = CUSTOMERS[i % CUSTOMERS.length];
    const drv = DRIVERS[1 + (i % 3)];
    const status = statuses[i % statuses.length];
    const subtotal = 40 + Math.round(Math.random() * 220);
    const deliveryFee = 6 + Math.round(Math.random() * 8);
    await setDoc(doc(db, `supermarkets/${store.id}/orders/demo_ord_${i}`), {
      supermarketId: store.id,
      customerId: cust.id,
      customerName: cust.name,
      status,
      deliveryStatus: status === 'delivered' ? 'delivered' : 'going_to_customer',
      items: [
        { name: 'Arroz 5kg', quantity: 1, price: 28.9 },
        { name: 'Feijão 1kg', quantity: 2, price: 8.5 },
      ],
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      paymentStatus: status === 'cancelled' ? 'refunded' : 'paid',
      payment: { method: pays[i % pays.length], status: status === 'cancelled' ? 'refunded' : 'paid' },
      deliveryMethod: 'delivery',
      deliveryAddress: { ...near(), street: 'Rua das Flores', number: String(100 + i), city: 'São Paulo' },
      driverId: drv.id,
      driverName: drv.name,
      driverEarnings: deliveryFee + 2,
      rating: status === 'delivered' ? 4 + Math.round(Math.random()) : undefined,
      demo: true,
      createdAt: daysAgo(i % 25),
      updatedAt: serverTimestamp(),
    });
    n++;
  }
  log(`${n} pedidos criados`);

  const tickets = [
    { id: 'demo_ticket_1', channel: 'customer', priority: 'urgent', category: 'delivery_problem', subject: 'Entregador não apareceu', requesterName: 'Beatriz Antunes', supermarketId: 'demo_store_1', orderId: 'demo_ord_3', customerId: 'demo_cust_1' },
    { id: 'demo_ticket_2', channel: 'store', priority: 'normal', category: 'billing', subject: 'Dúvida sobre repasse da semana', requesterName: 'Mercado Vila Verde', supermarketId: 'demo_store_1' },
    { id: 'demo_ticket_3', channel: 'driver', priority: 'high', category: 'sos', subject: 'Acionou botão de pânico (roubo)', requesterName: 'Ana Souza', driverId: 'demo_driver_3' },
  ];
  for (const t of tickets) {
    await setDoc(doc(db, 'tickets', t.id), {
      channel: t.channel,
      status: 'open',
      priority: t.priority,
      category: t.category,
      subject: t.subject,
      preview: t.subject,
      requesterName: t.requesterName,
      supermarketId: (t as any).supermarketId ?? null,
      orderId: (t as any).orderId ?? null,
      driverId: (t as any).driverId ?? null,
      customerId: (t as any).customerId ?? null,
      unread: true,
      demo: true,
      createdAt: daysAgo(Math.random() * 2),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, `tickets/${t.id}/messages/demo_m1`), {
      text: t.subject,
      authorRole: t.channel,
      authorId: 'demo',
      authorName: t.requesterName,
      createdAt: daysAgo(Math.random() * 2),
    });
  }
  log('Tickets criados');

  await setDoc(doc(db, 'campaigns', 'demo_campaign_1'), {
    code: 'BEMVINDO20',
    title: 'Boas-vindas — 20% OFF',
    type: 'percent',
    value: 20,
    payer: 'platform',
    minSubtotal: 50,
    maxDiscount: 30,
    budget: 5000,
    usedCount: 312,
    active: true,
    demo: true,
    createdAt: daysAgo(30),
    updatedAt: serverTimestamp(),
  });
  log('Pronto! Dados de demonstração criados.');
}

export async function clearDemoData(onProgress?: (msg: string) => void) {
  const log = (m: string) => onProgress?.(m);
  for (let i = 0; i < 24; i++) {
    for (const s of STORES) await deleteDoc(doc(db, `supermarkets/${s.id}/orders/demo_ord_${i}`)).catch(() => {});
  }
  await deleteDoc(doc(db, 'drivers/demo_driver_2/payouts/demo_payout_1')).catch(() => {});
  for (const s of STORES) await deleteDoc(doc(db, 'supermarkets', s.id)).catch(() => {});
  for (const d of DRIVERS) await deleteDoc(doc(db, 'drivers', d.id)).catch(() => {});
  for (const c of CUSTOMERS) await deleteDoc(doc(db, 'customers', c.id)).catch(() => {});
  for (const id of ['demo_ticket_1', 'demo_ticket_2', 'demo_ticket_3']) {
    await deleteDoc(doc(db, `tickets/${id}/messages/demo_m1`)).catch(() => {});
    await deleteDoc(doc(db, 'tickets', id)).catch(() => {});
  }
  await deleteDoc(doc(db, 'campaigns', 'demo_campaign_1')).catch(() => {});
  log('Dados de demonstração removidos.');
}
