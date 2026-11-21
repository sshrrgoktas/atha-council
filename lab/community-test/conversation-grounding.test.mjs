import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './worker.mjs';

const invitation = 'synthetic_test_invitation_never_used_live';
const user = content => ({role: 'user', speaker: 'human', content});
const modelMessage = (speaker, content) => ({role: 'model', speaker, content});

async function chat(model, latest, history = []) {
  const calls = [];
  const providerReply = 'Synthetic provider answer';
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
        return {response: providerReply};
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
  assert.equal(result.status, 'ok');
  assert.equal(result.model, model);
  return {calls, answer: result.answer, providerReply};
}

async function expectGrounded(model, latest, history) {
  const {calls, answer} = await chat(model, latest, history);
  assert.equal(calls.length, 0, 'Expected a local grounded answer to: ' + latest);
  assert.match(answer, /geçmedi|geçmiyor|konuşmuyor|yazışmıyor|edemiyor|yapmıyor|olmuyor|yok[. ]|do not|don't|cannot|can't|no (private|background)/iu);
  assert.match(answer, /bu (?:test odası|sohbet|oda)|görün|this (?:test room|chat)|visible/iu);
}

async function expectOrdinary(model, latest, history) {
  const {calls, answer, providerReply} = await chat(model, latest, history);
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
