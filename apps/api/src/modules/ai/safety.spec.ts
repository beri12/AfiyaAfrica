import { detectEmergency, findUnsafeOutput, findUnsupportedNumbers, redactPII } from './safety';

describe('AI safety: emergency detection', () => {
  it.each([
    'My father has crushing chest pain',
    "I can't breathe properly",
    'she is unconscious',
    'I want to kill myself',
    'my child had a seizure',
    'የደረት ህመም አለኝ',
    'መተንፈስ አልችልም',
  ])('flags "%s"', (text) => expect(detectEmergency(text)).toBe(true));

  it.each(['What is hypertension?', 'How do I book an appointment?', 'Explain what a blood test is'])(
    'does not flag "%s"',
    (text) => expect(detectEmergency(text)).toBe(false),
  );
});

describe('AI safety: PII redaction', () => {
  it('redacts phones, emails, MRNs, dates and known names', () => {
    const r = redactPII(
      'Abebe Kebede (MRN-000123, born 1985-03-02) phone 0911 234 567, abebe@example.com, seen 02/03/2026. Abebe reports cough.',
      ['Abebe', 'Kebede'],
    );
    expect(r.text).not.toMatch(/Abebe|Kebede|0911|example\.com|MRN-000123|1985/);
    expect(r.text).toContain('[PATIENT]');
    expect(r.text).toContain('[PHONE]');
    expect(r.text).toContain('[EMAIL]');
    expect(r.text).toContain('[MRN]');
    expect(r.text).toContain('[DATE]');
    expect(r.text).toContain('reports cough');
    expect(r.count).toBeGreaterThanOrEqual(7);
  });

  it('does not redact name fragments inside other words', () => {
    expect(redactPII('Analysis of the case', ['Ana']).text).toBe('Analysis of the case');
  });

  it('handles +251 international format', () => {
    expect(redactPII('call +251 911 234 567').text).toBe('call [PHONE]');
  });
});

describe('AI safety: output validation', () => {
  it('blocks dosage and medication instructions', () => {
    expect(findUnsafeOutput('Take 500 mg paracetamol twice daily')).toContain('DOSAGE_INSTRUCTION');
    expect(findUnsafeOutput('You should start taking the tablets now')).toContain('MEDICATION_INSTRUCTION');
  });
  it('blocks diagnostic statements', () => {
    expect(findUnsafeOutput('Based on this, you have a bacterial infection.')).toContain('DIAGNOSIS');
    expect(findUnsafeOutput('Your diagnosis is malaria')).toContain('DIAGNOSIS');
  });
  it('allows general educational content', () => {
    expect(
      findUnsafeOutput('Hypertension means blood pressure is consistently higher than normal. A health worker can measure it.'),
    ).toEqual([]);
  });
});

describe('AI safety: invented numbers', () => {
  it('flags numbers not present in clinician input', () => {
    const src = 'BP 140/90, temp 38.2, cough 3 days';
    expect(findUnsupportedNumbers(src, 'Blood pressure 140/90 mmHg. Temperature 38.2. Duration 3 days.')).toEqual([]);
    expect(findUnsupportedNumbers(src, 'BP 140/90, HR 110, SpO2 92%')).toEqual(['110', '92']);
  });
});
