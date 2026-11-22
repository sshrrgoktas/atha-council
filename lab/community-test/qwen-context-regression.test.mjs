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
  assert.ok(messages.some(turn => turn.role === 'user' &&
    turn.content.includes('İnsan (konu değişikliği)\n  Qwen, çayı unut')), 'the boundary must belong to the human who requested it');
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
      stalledTurn === 1 || turn === 2 ? new Promise(() => {}) : finalText(unsupportedClaim));
    let timer;
    try {
      const {calls, result} = await Promise.race([
        query,
        new Promise((_, reject) => {
          timer = realTimer(() => reject(new Error('chat request stayed pending after provider deadline')), 650);
        })
      ]);
      assert.equal(calls.length, 2, 'only generation may retry a provider timeout');
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
  assert.ok(input.some(m => m.role === 'user' && m.content.includes('Llama\n  Hangi dersi veriyorsun?')));
  assert.equal(result.answer, drafts[1]);
});

test('a repeated authorship error is corrected from the visible source', async () => {
  const {result} = await postChat('Peki.', teacherHistory, () => finalText('Ben de o yüzden sormuştum.'));
  assert.match(result.answer, /Llama/);
  assert.ok(result.answer.includes(teacherHistory[1].content));
  assert.doesNotMatch(result.answer, /sormuştum/u);
});


test('one transient Qwen timeout recovers within the original turn and budget', async () => {
  const answer = 'Buradayım. Yolculuk yorucu geçmiş.';
  const {calls, result} = await postChat('Çok yoruldum', [], turn => {
    if (turn === 1) throw new Error('3008: provider timed out');
    return finalText(answer);
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.id === calls[0].id));
  assert.deepEqual(calls[0].input.messages, calls[1].input.messages);
  assert.equal(result.answer, answer);
});

test('provider limits and unrelated errors do not trigger another inference', async () => {
  for (const [error, status] of [['4006: daily free allocation exhausted', 'quota_exhausted'], ['invalid model input', 'provider_error']]) {
    const {calls, result} = await postChat('Selam', [], () => { throw new Error(error); });
    assert.equal(calls.length, 1);
    assert.equal(result.status, status);
  }
});

test('a past reply is quoted as evidence rather than a response format to imitate', async () => {
  const oldReply = '[{"speaker":"qwen","text":"Ben Qwen’im."}]';
  const history = [human('Adınız ne?'), reply('qwen', oldReply), reply('llama', 'Ben Llama’yım.')];
  const latest = 'Barışalım mı, kurabiyeler benden.';
  const {calls} = await postChat(latest, history, () => finalText('Elbette, teşekkür ederim!'));
  assert.equal(calls.length, 1);
  const messages = calls[0].input.messages;
  assert.ok(!messages.some(turn => turn.role === 'assistant' && turn.content.includes(oldReply)));
  const current = messages.at(-1);
  assert.equal(current.role, 'user');
  assert.ok(current.content.includes('Qwen\n  ' + oldReply));
  assert.ok(current.content.includes('Llama\n  Ben Llama’yım.'));
  assert.ok(current.content.endsWith('Şimdi insan yazıyor\n' + latest));
});

test('a mistaken claim about a human contribution is corrected by the original model and checked again', async () => {
  const bad = 'Serginin afişini ben çizdim.';
  const fixed = 'Afişi sen çizdin. Renklerle ilgili yorumu Llama yaptı.';
  const staged = [bad, 'WRONG human', fixed, 'ALLOW'];
  const context = [human('Serginin afişini ben çizdim.'), reply('llama', 'Renkler çok hoş!')];
  const {calls,result} = await postChat('Afişten bahsediyorduk.', context, turn => finalText(staged[turn-1]));
  assert.equal(result.answer, fixed);
  assert.deepEqual(calls.map(call => call.id.includes('qwen')), [true,false,true,false]);
  assert.ok(calls[1].input.messages.at(-1).content.includes(bad));
  assert.ok(calls[2].input.messages[0].content.includes('source was human'));
  assert.ok(calls[3].input.messages.at(-1).content.includes(fixed));
});

test('uncertain or unresolved ownership cannot publish another participant’s words as mine', async () => {
  const draft = 'Ben yaptım, kumaşları ben boyadım.';
  const context = [human('Kumaşları ben boyadım.'), reply('llama', 'Güzel olmuş.')];
  for (const sequence of [[draft,'UNCERTAIN'], [draft,'WRONG human',draft], [draft,'yalnızca bir tahmin']]) {
    const {result,calls} = await postChat('Bu çalışmadan söz edelim.', context, turn => finalText(sequence[turn-1]));
    assert.equal(result.answer, undefined);
    assert.ok(['incomplete','review_unavailable'].includes(result.status));
    assert.equal(calls.length, sequence.length);
  }
});

test('partial quotation of a peer’s impersonal praise still carries its original speaker', async () => {
  const praise = 'Derslerinde doğanın mucizelerini keşfetmek ne güzel.';
  const history = [human('Biyoloji öğretiyorum.'), reply('llama', praise), reply('qwen', 'Hangi kademede?')];
  const bad = 'Bu benim klişe bir övgüye kaçmamam gerektiğini gösteriyor. “Mucizeleri keşfetmek”ten çok günlük işleri sorayım.';
  const fixed = 'O söz Llama’nındı. Senin derslerini nasıl anlattığını merak ediyorum.';
  const sequence = [bad,'WRONG llama',fixed,'ALLOW'];
  const {calls,result} = await postChat('Sıradan bir ders işte.', history, turn=>finalText(sequence[turn-1]));
  assert.equal(result.answer, fixed);
  assert.deepEqual(calls.map(call => call.id.includes('qwen')), [true,false,true,false]);
  const record = JSON.parse(calls[1].input.messages.at(-1).content);
  assert.ok(record.history.some(turn=>turn.speaker==='llama' && turn.content===praise));
});


test('an immediate follow-up about an absent interval keeps the explicit room answer',async()=>{
 const {calls,result}=await postChat('Peki o sırada birbirinize ne dediniz?',[
  human('Ben yokken ne yaptınız?'),reply('llama','Sen yazınca yanıt veriyoruz.')
 ],()=>{ throw Error('no background inference is needed'); });
 assert.equal(calls.length,0);
 assert.equal(result.status,'ok');
 assert.match(result.answer,/ayrı bir konuşma geçmiyor/u);
});

test('a direct address question uses the visible correction, even following a joking interjection', async () => {
  const history = [human('Llama ve Qwen, az önce Llama’ya şakasına salak dedim.'), reply('llama','Kimle?'), human('Ben Llama’ya dedim.'), reply('qwen','Hadi yarışalım!')];
  const {calls,result} = await postChat('Llama sensin. Qwen de burada. İkiniz de kendi adınıza söyler misiniz, az önce kime takıldım?', history, ()=>{throw new Error('explicit source is sufficient')});
  assert.equal(calls.length, 0);
  assert.equal(result.answer,'Ben Qwen’im, Llama’ya takıldın. “Ben Llama’ya dedim” diye yazdın.');
});

test('a first-person item offer is attributed to the author of the actual offer', async () => {
  const history=[human('Simitleri ben alayım; siz ne içersiniz?'),reply('llama','Çay içebilirim.')];
  const {result,calls}=await postChat('Simitleri almayı kim teklif etti?',history,()=>{throw new Error('source available')});
  assert.equal(result.answer,'Teklif senden geldi. “Simitleri ben alayım” diye yazdın.');
  assert.equal(calls.length,0);
});

test('missing participant answer gets one repair by the original author, but a general resemblance question stays ordinary', async () => {
  const history=[human('Herkes sırayla konuştu.'),reply('llama','Neredesin?'),human('Okuldayım.')];
  const sequence=['Kim daha hızlı cevap verecek acaba?','MISSING','Llama sordu.','ALLOW'];
  const {result,calls}=await postChat('Az önce kim sordu?',history,turn=>finalText(sequence[turn-1]));
  assert.equal(result.answer,'Llama sordu.');
  assert.deepEqual(calls.map(call=>call.id.includes('qwen')), [true,false,true,false]);
  const ordinary=await postChat('Bulut kime benziyor?', history,()=>finalText('Bir tavşana benziyor.'));
  assert.equal(ordinary.calls.length,1);
});

test('an old offer or an unrelated correction cannot establish the requested person', async () => {
  for(const [history,latest] of [
    [[human('Dün simitleri ben alayım dedim.')],'Simitleri almayı kim teklif etti?'],
    [[human('Simitleri ben almayayım.')],'Simitleri almayı kim teklif etti?'],
    [[human('Renkleri Qwen’e sordum.'),human('Ben Llama’ya dedim.')],'Az önce renkleri kime sordum?'],
    [[human('Ben Llama’ya dedim.')],'Az önce kime takıldım?'],
    [[human('Simitleri ben alayım.')],'Geçen hafta simitleri almayı kim teklif etti?']
  ]){
    const {calls}=await postChat(latest,history,turn=>finalText(turn===1?'Eldeki mesajlardan kesinleştiremiyorum.':'ALLOW'));
    assert.ok(calls.length>0,'unrelated or temporally ambiguous sources must not short-circuit review');
  }
});
