import { createClient } from '@supabase/supabase-js';
const db = createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

const { count: total } = await db.from('lessons').select('id', { count: 'exact', head: true });
const { data: byBook } = await db.from('lessons').select('book');
const counts = {};
(byBook || []).forEach(r => counts[r.book] = (counts[r.book] || 0) + 1);
console.log('Total lessons:', total);
console.log('By book:');
Object.entries(counts).sort().forEach(([k,v]) => console.log('  ', v.toString().padStart(4), k));

// What does select('*').order('id') return?
const { data: ordered } = await db.from('lessons').select('id,book').order('id');
console.log('\n.order(id) returns:', ordered?.length, 'rows');
console.log('First book in result:', ordered?.[0]?.book, '  Last book:', ordered?.[ordered.length-1]?.book);

// Filter for TOCFL_C1 specifically
const c1 = (ordered || []).filter(l => (l.book || 'B1') === 'TOCFL_C1');
console.log('TOCFL_C1 lessons returned through .order(id):', c1.length);
