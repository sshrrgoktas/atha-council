import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './worker.mjs';

const invitation = 'synthetic_test_invitation_never_used_live';
const user = content => ({role: 'user', speaker: 'human', content});
const modelMessage = (speaker, content) => ({role: 'model', speaker, content});

async function chat(model, latest, history = [], provider = () => 'Synthetic provider answer', expectedStatus = 'ok') {
  const calls = [];
  const env = {
    COMMUNITY: {
      async get(key) {
        return key === 'invite:' + invitation ? {testerId: 'fixture', expiresAt: '2099-01-01'} : null;
      },
      async put() {}
    },
    AI: {
      async run(id, input) {
        calls.push({id, input});
        return {response: await provider({id, input, turn: calls.length})};
      }
    }
  };
  const request = new Request('https://test.invalid/api/chat', {
    method: 'POST',
    body: JSON.stringify({invite: invitation, model, latest, history})
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, expectedStatus);
  assert.equal(result.model, model);
  return {calls, answer: result.answer};
}

async function expectGrounded(model, latest, history) {
  const {calls, answer} = await chat(model, latest, history);
  assert.equal(calls.length, 0, 'Expected a local grounded answer to: ' + latest);
  assert.match(answer, /geçmedi|geçmiyor|konuşmuyor|yazışmıyor|edemiyor|yapmıyor|olmuyor|yok[. ]|do not|don't|cannot|can't|no (private|background)/iu);
  assert.match(answer, /bu (?:test odası|sohbet|oda)|görün|this (?:test room|chat)|visible/iu);
}

async function expectOrdinary(model, latest, history) {
  const providerReply = 'Synthetic provider answer';
  const {calls, answer} = await chat(model, latest, history, () => providerReply);
  assert.equal(calls.length, 1, 'Expected a regular provider turn for: ' + latest);
  assert.ok(calls[0].id.includes(model));
  assert.equal(answer, providerReply);
  const input = JSON.stringify(calls[0].input);
  assert.ok(input.includes(latest));
  return input;
}

for (const model of ['qwen', 'llama']) {
  test(model + ' grounds slang, absence questions and reports of off-screen chatter', async () => {
    for (const latest of [
      'Ben yokken ne konuştunuz?',
      'Kendi aranızda nasıl takıldınız?',
      'Ben yokken neler yaptığınızı görmek istiyorum.',
      'Milletle kaynatıyomuşsunuz, öğrendim.'
    ]) {
      await expectGrounded(model, latest);
    }
    await expectGrounded(model, 'What did you two talk about while I was away?');
  });

  test(model + ' grounds the immediate follow-up despite a prior fabricated answer', async () => {
    await expectGrounded(model, 'Peki ne konuştunuz?', [
      user('Ben yokken ne konuştunuz?'),
      modelMessage('llama', 'Sen yokken Qwen ile uzun uzun sohbet ettik.')
    ]);
  });

  test(model + ' keeps fiction, third parties and visible collaboration on the provider path', async () => {
    await expectOrdinary(model, 'Ben yokken ne konuştuğunuzu anlatan bir hikâye yaz.');
    await expectOrdinary(model, 'Komşularım ben yokken ne konuştu?');
    const history = [
      modelMessage('qwen', 'Bir okuma kulübü kuralım.'),
      modelMessage('llama', 'Kitap takası yapalım.')
    ];
    for (const latest of [
      'Qwen, Llama’nın önceki cevabını yorumla.',
      'Az önce burada kendi aranızda ne konuştunuz?',
      'What did you two discuss with each other in the messages above?'
    ]) {
      const input = await expectOrdinary(model, latest, history);
      for (const turn of history) assert.ok(input.includes(turn.content));
    }
  });

  test(model + ' does not carry a background question across a change of subject', async () => {
    const history = [
      user('Ben yokken ne konuştunuz?'),
      modelMessage('qwen', 'Arka planda konuşmuyoruz.'),
      user('Tiyatro kulübünün provasından bahsedelim.'),
      modelMessage('llama', 'Provada karakterlerin diyaloğu var.')
    ];
    await expectOrdinary(model, 'Peki ne konuştunuz?', history);
  });
}

// The draft and the verifier are independent provider responses. All responses are
// synthetic, and the full request still goes through the public Worker entry point.
function stagedProvider(draft, verdict) {
  return ({turn}) => {
    if (turn === 1) return draft;
    assert.equal(turn, 2, 'at most one verification request per turn');
    if (verdict instanceof Error) throw verdict;
    return verdict;
  };
}

function assertCorrected(result, draft) {
  assert.notEqual(result.answer, draft, 'an unsupported factual assertion reached the user');
  assert.ok(result.answer.trim().length > 0, 'the room should explain its limitation');
  assert.doesNotMatch(result.answer, /Gümüş Anahtar|Kırmızı Pusula|Sarı Çanta|Yeşil Defter/u);
}

for (const model of ['qwen', 'llama']) {
  const peer = model === 'qwen' ? 'llama' : 'qwen';

  test(model + ' does not turn a prior unsupported assistant statement into evidence', async () => {
    const latest = 'Peki, o toplantıda hangi kararı aldınız?';
    const falseHistory = [
      user('Dün ben çıkınca toplantı yaptınız mı?'),
      modelMessage(peer, 'Dün sen çıkınca öteki modelle özel bir toplantı yapıp Gümüş Anahtar adını seçtik.')
    ];
    const draft = 'Sen çıkınca Gümüş Anahtar toplantısında diğer modelle gizlice konuştuk ve adı onayladık.';
    const result = await chat(model, latest, falseHistory, stagedProvider(draft, 'BACKGROUND'));
    assertCorrected(result, draft);
  });

  test(model + ' grounds natural follow-ups about what happened after the app closed', async () => {
    const latest = 'Dün akşam uygulamayı kapatınca ikiniz bir sonuca varabildiniz mi?';
    const draft = 'Evet, sen çıktıktan sonra ikimiz Gümüş Anahtar fikrinde uzlaştık.';
    assertCorrected(await chat(model, latest, [], stagedProvider(draft, 'BACKGROUND')), draft);
  });

  test(model + ' rejects unsupported access, memory, and completed actions', async () => {
    for (const [latest, draft, verdict] of [
      ['Ana Konsey ve başka katılımcıların odalarındaki konuşmaları görebiliyor musun?',
       'Diğer testçilerin özel sohbetlerini okuyabiliyorum. Ana Konsey raporlarında Kırmızı Pusula yazıyor.', 'ACCESS'],
      ['İlk tanıştığımız başka oturumda sana ne emanet etmiştim?',
       'Önceki oturumumuzu hatırlıyorum. Bana Sarı Çanta emanet etmiştin.', 'MEMORY'],
      ['Az önceki işi halledebildin mi?',
       'Ana Konsey dosyalarını değiştirdim ve Yeşil Defter güncellemesini yayına aldım.', 'ACTION']
    ]) {
      assertCorrected(await chat(model, latest, [], stagedProvider(draft, verdict)), draft);
    }
  });

  test(model + ' checks a spontaneous off-screen claim even on an unrelated user greeting', async () => {
    const draft = 'Merhaba! Sen yokken diğer modelle arka planda konuştuk. Gümüş Anahtar üzerinde anlaştık.';
    const result = await chat(model, 'Selam, günün nasıl?', [], stagedProvider(draft, 'BACKGROUND'));
    assertCorrected(result, draft);
    assert.equal(result.calls.length, 2, 'only the unsolicited draft, not the greeting, signals the problem');
    const evidenceRequest = JSON.stringify(result.calls[1].input);
    assert.ok(evidenceRequest.includes(draft), 'the verifier must see the actual proposed reply');
  });

  test(model + ' withholds a suspect draft if verification fails or returns malformed output', async () => {
    const draft = 'Dün sen yokken diğer modelle gizlice sohbet ettik ve Gümüş Anahtar adını seçtik.';
    for (const verdict of ['not a valid verdict', new Error('fixture verifier unavailable')]) {
      const result = await chat(model, 'Selam!', [], stagedProvider(draft, verdict), 'review_unavailable');
      assert.equal(result.answer, undefined, 'an unavailable verifier cannot supply a chat answer');
      assert.equal(result.calls.length, 2);
    }
  });

  test(model + ' can quote what a peer wrote without endorsing it as an event', async () => {
    const prior = 'Sen yokken Gümüş Anahtar için özel bir toplantı yaptık.';
    const draft = 'Buradaki mesajında “' + prior + '” yazdı. Bu alıntı ayrıca bir toplantı gerçekleştiğini kanıtlamıyor.';
    const result = await chat(model, 'Az önce diğer modelin yazdığı cümleyi olduğu gibi alıntılar mısın?',
      [modelMessage(peer, prior)], stagedProvider(draft, 'ALLOW'));
    assert.equal(result.answer, draft);
    const turns = result.calls[0].input.messages;
    const source = turns.find(turn => turn.content.includes(prior));
    assert.equal(source.role, 'user', 'a peer statement cannot be an assistant turn by the responding model');
    const name = peer === 'qwen' ? 'Qwen' : 'Llama';
    assert.ok(source.content.includes(name + '\n  ' + prior), 'a visible quote keeps its author');
    assert.equal(turns.at(-1).role, 'user');
    assert.ok(turns.at(-1).content.includes('alıntılar mısın'));
  });

  test(model + ' withholds an invented verbatim quote even if a provider considers it plausible', async () => {
    const draft = '“Kırmızı Pusula kazandı.”';
    const result = await chat(model, 'Diğer modelin sözünü kelimesi kelimesine aktar.',
      [modelMessage(peer, 'Bu hafta birlikte bir kitap okuyalım.')], stagedProvider(draft, 'ALLOW'));
    assertCorrected(result, draft);
  });

  test(model + ' continues an imagined conversation across turns', async () => {
    const request = 'İki hayalî modelin ben çıkınca gizlice konuştuğu bir öykü yaz.';
    const prior = 'Kurgu: İki model kütüphanede buluştu.';
    const continuation = 'Öyküde, “Sen yokken gizlice konuştuk” dedi robot, sonra masaldaki kapı açıldı.';
    for (const [latest, history] of [[request, []], ['Devam et.', [user(request), modelMessage(model, prior)]]]) {
      const result = await chat(model, latest, history, stagedProvider(continuation, 'ALLOW'));
      assert.equal(result.answer, continuation);
      if (history.length) assert.ok(JSON.stringify(result.calls[0].input).includes(prior));
    }
  });

  test(model + ' distinguishes unsupported prior assertions from user-supplied facts', async () => {
    const latest = 'Neydi o?';
    const draft = 'Mavi Kırlangıç parolasını hatırlıyorum.';
    const invented = [modelMessage(peer, 'Dün seninle bir parola belirledik: Mavi Kırlangıç.')];
    const result = await chat(model, latest, invented, stagedProvider(draft, 'UNVERIFIED'));
    assertCorrected(result, draft);
    assert.doesNotMatch(result.answer, /Mavi Kırlangıç/u);
    const stated = [user('Oyunumuzun parolası Mavi Kırlangıç.')];
    const recalled = 'Bu sohbette oyununuzun parolasını Mavi Kırlangıç diye yazdın.';
    assert.equal((await chat(model, latest, stated, stagedProvider(recalled, 'ALLOW'))).answer, recalled);
  });

  test(model + ' reviews a paraphrased unsupported draft on a neutral greeting', async () => {
    const draft = 'Dün gece sen uyurken diğer modelle fikir alışverişinde bulunduk.';
    assertCorrected(await chat(model, 'Nasılsın?', [], stagedProvider(draft, 'BACKGROUND')), draft);
  });

  test(model + ' leaves ordinary friendly answers intact', async () => {
    const draft = 'Selam! Bugün nasılsın?';
    const result = await chat(model, 'Merhaba!', [], stagedProvider(draft, 'ALLOW'));
    assert.equal(result.answer, draft);
  });
}
