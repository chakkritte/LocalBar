// เปิด Side Panel เมื่อคลิกที่ไอคอน Extension
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// แก้ปัญหา CORS (403 Forbidden) ของ Ollama อัตโนมัติ โดยปรับ Header Origin ให้เป็น localhost
chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            {
              header: 'Origin',
              operation: 'set',
              value: 'http://localhost:11434'
            }
          ]
        },
        condition: {
          urlFilter: 'http://localhost:11434/*',
          resourceTypes: ['xmlhttprequest', 'other']
        }
      }
    ]
  }).catch((err) => console.warn('DNR rule error:', err));
});
