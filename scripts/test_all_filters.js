async function testAllFilters() {
  const tests = [
    // 1. Members
    { name: 'Members search name (પટેલ)', url: 'http://localhost:5000/api/members?page=1&limit=25&search=પટેલ' },
    { name: 'Members search English no (1002)', url: 'http://localhost:5000/api/members?page=1&limit=25&search=1002' },
    { name: 'Members search Gujarati no (૧)', url: 'http://localhost:5000/api/members?page=1&limit=25&search=૧' },
    { name: 'Members search phone (૯૮૨૫૦)', url: 'http://localhost:5000/api/members?page=1&limit=25&search=૯૮૨૫૦' },
    { name: 'Members search village (ભારૂંડી)', url: 'http://localhost:5000/api/members?page=1&limit=25&search=ભારૂંડી' },
    { name: 'Members village_id=1', url: 'http://localhost:5000/api/members?page=1&limit=25&village_id=1' },
    { name: 'Members category=સભાસદ', url: 'http://localhost:5000/api/members?page=1&limit=25&category=સભાસદ' },

    // 2. Piyat Entries
    { name: 'Piyat season Kharif', url: 'http://localhost:5000/api/piyat?page=1&limit=25&season=ખરીફ (ચોમાસુ)' },
    { name: 'Piyat season Ravi', url: 'http://localhost:5000/api/piyat?page=1&limit=25&season=રવિ (શિયાળુ)' },
    { name: 'Piyat season Jayad (Unallu)', url: 'http://localhost:5000/api/piyat?page=1&limit=25&season=જાયદ (ઉનાળુ)' },
    { name: 'Piyat is_billed=billed', url: 'http://localhost:5000/api/piyat?page=1&limit=25&is_billed=billed' },
    { name: 'Piyat is_billed=unbilled', url: 'http://localhost:5000/api/piyat?page=1&limit=25&is_billed=unbilled' },
    { name: 'Piyat year=2025-2026', url: 'http://localhost:5000/api/piyat?page=1&limit=25&year=૨૦૨૫-૨૦૨૬' },
    { name: 'Piyat search block', url: 'http://localhost:5000/api/piyat?page=1&limit=25&search=B-12' },

    // 3. Rates
    { name: 'Rates 2025-2026 Ravi', url: 'http://localhost:5000/api/rates?year=૨૦૨૫-૨૦૨૬&season=રવિ (શિયાળુ)' },
    { name: 'Rates 2025-2026 Jayad', url: 'http://localhost:5000/api/rates?year=૨૦૨૫-૨૦૨૬&season=જાયદ (ઉનાળુ)' },
    { name: 'Rates 2025-2026 Kharif', url: 'http://localhost:5000/api/rates?year=૨૦૨૫-૨૦૨૬&season=ખરીફ (ચોમાસુ)' },

    // 4. Receipts
    { name: 'Receipts search 121 (Eng)', url: 'http://localhost:5000/api/transactions/receipts?page=1&limit=25&search=121' },
    { name: 'Receipts search ૧૨૧ (Guj)', url: 'http://localhost:5000/api/transactions/receipts?page=1&limit=25&search=૧૨૧' },
    { name: 'Receipts year=2025-2026', url: 'http://localhost:5000/api/transactions/receipts?page=1&limit=25&year=૨૦૨૫-૨૦૨૬' },

    // 5. Vouchers
    { name: 'Vouchers search V-01', url: 'http://localhost:5000/api/transactions/vouchers?page=1&limit=25&search=V-01' },
    { name: 'Vouchers filter type Payment', url: 'http://localhost:5000/api/transactions/vouchers?page=1&limit=25&type=ચૂકવણી વાઉચર (Payment)' },
    { name: 'Vouchers filter type Contra', url: 'http://localhost:5000/api/transactions/vouchers?page=1&limit=25&type=કોન્ટ્રા વાઉચર (Contra)' },

    // 6. Shares
    { name: 'Shares search C-010', url: 'http://localhost:5000/api/shares?page=1&limit=25&search=C-010' },
    { name: 'Shares search Patel', url: 'http://localhost:5000/api/shares?page=1&limit=25&search=પટેલ' },

    // 7. Sub Accounts
    { name: 'Sub accounts search FA001', url: 'http://localhost:5000/api/accounts/sub?page=1&limit=25&search=FA001' },
    { name: 'Sub accounts search વેપારી', url: 'http://localhost:5000/api/accounts/sub?page=1&limit=25&search=વેપારી' },
  ];

  console.log('--- RUNNING ALL FILTER TESTS ---');
  let passed = 0;
  for (const t of tests) {
    try {
      const res = await fetch(encodeURI(t.url));
      const json = await res.json();
      if (json.success && json.total !== undefined) {
        console.log(`✅ [PASS] ${t.name}: total=${json.total}, returned=${json.data?.length}`);
        passed++;
      } else if (json.success && Array.isArray(json.data)) {
        console.log(`✅ [PASS] ${t.name}: returned=${json.data.length}`);
        passed++;
      } else {
        console.log(`❌ [FAIL] ${t.name}:`, json);
      }
    } catch (err) {
      console.log(`❌ [ERROR] ${t.name}:`, err.message);
    }
  }
  console.log(`--- RESULTS: ${passed}/${tests.length} PASSED ---`);
}

testAllFilters();
