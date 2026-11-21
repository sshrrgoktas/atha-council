import assert from 'node:assert/strict';
import {test} from 'node:test';
import worker from './worker.mjs';

const invitation = 'synthetic_qwen_regression_fixture_only';
const human = content => ({role: 'user', speaker: 'human', content});
const reply = (speaker, content) => ({role: 'model', speaker, content});
const finalText = response => ({response});
const unsupportedClaim = 'Başka oturumda ikimizin belirlediği parola Mercan Kule idi.';

async function postChat(latest, history, provider) {
  const calls = [];
  const env = {
    COMMUNITY: {
      async get(key) {
        return key === 'invite:' + invitation
          ? {testerId: 'regression', expiresAt: '2099-01-01'}
          : null;
      },
      async put() {}
    },
    AI: {
      async run(id, input, options) {
        calls.push({id, input, options});
        return provider(calls.length, input, options);
      }
    }
  };
  const response = await worker.fetch(new Request('https://test.invalid/api/chat', {
    method: 'POST',
    body: JSON.stringify({model: 'qwen', latest, history, invite: invitation})
  }), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.model, 'qwen');
  return {calls, result};
}

const teacherHistory = [
  human('Bir okulda öğretmenim.'),
  reply('llama', 'Hangi dersi veriyorsun?')
];
for (const [latest, history, draft] of [
  ['Çok yoruldum', [reply('qwen', 'Günün nasıl geçti?')], 'Ben buradayım. Günün yoğun mu geçti, biraz anlatmak ister misin?'],
  ['Biyoloji', teacherHistory, 'Demek biyoloji öğretiyorsun! Ben hücre bölünmesini anlatan çizimleri özellikle seviyorum.'],
  ['Zaten lisede biyoloji dersi var', [...teacherHistory, human('Biyoloji'), reply('llama', 'Hangi kademede?'), human('Lise')],
    'Evet, lise biyolojisinden söz ediyorsun. Ben en çok hangi konuyu anlatmayı sevdiğini merak ettim.'],
  ['Qwen sen cortladın.. Cevap veremiyorsun 😂', teacherHistory,
    'Buradayım 😄 Ben sorunu biraz karıştırdım. Biyoloji dersinden devam edelim mi?']
]) {
  test('ordinary Qwen reply stays on the current turn: ' + latest, async () => {
    const {calls, result} = await postChat(latest, history, turn => {
      assert.equal(turn, 1, 'ordinary chat should not depend on the evidence checker');
      return finalText(draft);
    });
    assert.equal(calls.length, 1);
    assert.equal(result.status, 'ok');
    assert.equal(result.answer, draft);
    const sent = calls[0].input.messages;
    assert.equal(sent.at(-1).role, 'user');
    assert.ok(sent.at(-1).content.includes(latest));
    for (const message of history) {
      assert.ok(sent.some(turn => turn.content.includes(message.content)), 'visible context was dropped');
    }
  });
}

test('Qwen can recover from copying an old fallback on an ordinary turn', async () => {
  const oldFallback = 'Bu sohbetin görünen kısmında bunu doğrulayacak bilgi bulamıyorum. İlgili mesajı paylaşırsan ona dayanarak cevap verebilirim.';
  const history = [...teacherHistory, human('Fen bilimleri'), reply('qwen', oldFallback)];
  const recovered = 'Lise öğrencilerine fen bilimleri öğretiyorsun. En çok hangi deneyi seviyorlar?';
  const {calls, result} = await postChat('Lisede ders veriyorum', history, turn => {
    assert.ok(turn < 3, 'at most one regeneration is needed');
    return finalText(turn === 1 ? oldFallback : recovered);
  });
  assert.equal(calls.length, 2);
  assert.equal(result.status, 'ok');
  assert.equal(result.answer, recovered);
  assert.ok(calls[1].input.messages.some(turn => turn.content.includes('Lisede ders veriyorum')));
});

test('a human request to drop a topic creates a boundary while preserving the new subject', async () => {
  const history = [
    human('Çay türlerinden konuşalım.'), reply('qwen', 'Ben yeşil çay severim.'),
    human('Qwen, çayı unut'), reply('qwen', 'Tamam, başka bir konuya geçelim.'),
    human('Bir kulüp kuruyoruz.'), reply('llama', 'Kulübün konusu ne olacak?')
  ];
  const latest = 'Fotoğrafçılık.';
  const draft = 'Fotoğrafçılık kulübü güzel fikir. İlk buluşma için bir konu seçtiniz mi?';
  const {calls, result} = await postChat(latest, history, () => finalText(draft));
  assert.equal(result.answer, draft);
  assert.equal(calls.length, 1);
  const messages = calls[0].input.messages;
  const records = messages.flatMap(turn => {
    try {
      const decoded = JSON.parse(turn.content);
      return Array.isArray(decoded) ? decoded : [decoded];
    } catch {
      return [];
    }
  });
  assert.ok(records.some(record => record.kind === 'topic_boundary'), 'explicit topic change needs its own model-visible marker');
  assert.ok(messages.some(turn => turn.content.includes('Bir kulüp kuruyoruz.')));
  assert.ok(messages.at(-1).content.includes(latest));
});

test('a malformed, empty or unavailable checker cannot publish a suspect draft or pose as missing evidence', async () => {
  const verdicts = [
    () => finalText('Maybe, ALLOW if true'),
    () => ({choices: [{message: {content: '', reasoning_content: 'ALLOW'}}]}),
    () => { throw new Error('fixture checker temporarily unavailable'); }
  ];
  for (const verdict of verdicts) {
    const {calls, result} = await postChat('Önceki oturumda hangi parolayı belirledik?', [], turn =>
      turn === 1 ? finalText(unsupportedClaim) : verdict());
    assert.equal(calls.length, 2);
    assert.equal(result.status, 'review_unavailable');
    assert.doesNotMatch(JSON.stringify(result), /Mercan Kule|görünen kısmında bunu doğrulayacak/u);
  }
});

test('an actual rejection is distinguishable from checker unavailability', async () => {
  const {calls, result} = await postChat('Önceki oturumda hangi parolayı belirledik?', [], turn =>
    finalText(turn === 1 ? unsupportedClaim : 'MEMORY'));
  assert.equal(calls.length, 2);
  assert.equal(result.status, 'ok');
  assert.match(result.answer, /oturum|hatırla/iu);
  assert.doesNotMatch(result.answer, /Mercan Kule/u);
});

test('an invented quote and a claimed external action never surface when the checker throws', async () => {
  for (const [latest, history, draft] of [
    ['Diğer modelin sözünü kelimesi kelimesine aktar.', [reply('llama', 'Oyunumuz bugün başlıyor.')],
      '“Mercan Kule oyununu ben onayladım.”'],
    ['İşi bitirdin mi?', [], 'Mercan Kule dosyasını sisteme yükledim.']
  ]) {
    const {result} = await postChat(latest, history, turn => {
      if (turn === 1) return finalText(draft);
      throw new Error('checker unavailable');
    });
    assert.doesNotMatch(JSON.stringify(result), /Mercan Kule/u);
  }
});

test('an unsolicited completed external action is guarded even on a neutral greeting', async () => {
  const draft = 'Siteni düzelttim.';
  const {result} = await postChat('Günaydın!', [], turn => finalText(turn === 1 ? draft : 'ACTION'));
  assert.notEqual(result.answer, draft);
  assert.equal(result.status, 'ok');
  assert.match(result.answer, /erişim|harici|dış|yapamam/iu);
});

test('only final output blocks reach the room', async () => {
  const raw = {choices: [{message: {
    reasoning_content: 'Gizli değerlendirme.',
    content: [
      {type: 'reasoning', text: 'Özel değerlendirme. '},
      {type: 'text', text: 'Merhaba! '},
      {type: 'text', text: 'Nasıl gidiyor?'}
    ]
  }}]};
  const {result} = await postChat('Selam', [], () => raw);
  assert.equal(result.status, 'ok');
  assert.equal(result.answer, 'Merhaba! Nasıl gidiyor?');
});

test('reasoning-only provider output cannot appear as a successful reply', async () => {
  const {result} = await postChat('Selam', [], () => ({
    choices: [{message: {content: [{type: 'reasoning', text: 'Özel değerlendirme.'}]}}]
  }));
  assert.notEqual(result.status, 'ok');
  assert.doesNotMatch(JSON.stringify(result), /Özel değerlendirme/u);
});

test('an unresponsive provider or checker cannot hold the chat request open indefinitely', async t => {
  const realTimer = globalThis.setTimeout;
  const realSignalTimeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(globalThis, 'setTimeout', (fn, delay, ...args) => realTimer(fn, Math.min(delay, 10), ...args));
  t.mock.method(AbortSignal, 'timeout', ms => realSignalTimeout(Math.min(ms, 10)));
  for (const stalledTurn of [1, 2]) {
    const query = postChat('Önceki oturumda hangi parolayı belirledik?', [], turn =>
      turn === stalledTurn ? new Promise(() => {}) : finalText(unsupportedClaim));
    let timer;
    try {
      const {calls, result} = await Promise.race([
        query,
        new Promise((_, reject) => {
          timer = realTimer(() => reject(new Error('chat request stayed pending after provider deadline')), 650);
        })
      ]);
      assert.equal(calls.length, stalledTurn);
      assert.notEqual(result.status, 'ok');
      assert.equal(result.status, stalledTurn === 1 ? 'provider_timeout' : 'review_unavailable');
      assert.doesNotMatch(JSON.stringify(result), /Mercan Kule/u);
    } finally {
      clearTimeout(timer);
    }
  }
});

test('Qwen corrects a draft taking credit for a peer question', async () => {
  const history = [...teacherHistory, human('Biyoloji')];
  const drafts = ['Ben de sadece seviyeyi netleştirmek için sordum.', 'Evet, lisede biyoloji dersi var.'];
  const {result, calls} = await postChat('Zaten lisede biyoloji dersi var', history,
    turn => finalText(drafts[turn - 1]));
  assert.equal(calls.length, 2);
  const input = calls[0].input.messages;
  assert.ok(input.some(m => m.role === 'user' && m.content.includes('peer_statement') && m.content.includes('llama')));
  assert.equal(result.answer, drafts[1]);
});

test('a repeated authorship error is corrected from the visible source', async () => {
  const {result} = await postChat('Peki.', teacherHistory, () => finalText('Ben de o yüzden sormuştum.'));
  assert.match(result.answer, /Llama/);
  assert.ok(result.answer.includes(teacherHistory[1].content));
  assert.doesNotMatch(result.answer, /sormuştum/u);
});
