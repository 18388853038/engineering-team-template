const fs = require('fs');
const f = 'F:\\v3.0_backup_2026-05-05\\frontend\\dist\\index.html';
let c = fs.readFileSync(f, 'utf-8');

// Find the misplaced CSS after </style>
const styleEnd = c.indexOf('</style>');
const afterStyle = c.substring(styleEnd);
// The login CSS starts with a line break + "<" character that breaks HTML
// Remove everything from that broken point up to the next valid HTML tag

// Strategy: find and remove the broken login CSS between </style> and </head>
const headClose = c.indexOf('</head>', styleEnd);
if (headClose > styleEnd) {
  // There's content between </style> and </head> that shouldn't be there
  // Extract the valid stuff and put it inside <style>
  const badContent = c.substring(styleEnd + 9, headClose);
  console.log('Bad content:', badContent.substring(0, 100));
  
  // Move the login CSS into the style tag
  // First, remove it from where it is
  c = c.substring(0, styleEnd + 9) + c.substring(headClose);
  
  // Then add it before </style>
  const loginCSS = `
/* Login Overlay */
#loginOverlay{position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);display:flex;align-items:center;justify-content:center;z-index:9999}
#loginBox{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;width:360px;text-align:center}
#loginBox h1{font-size:20px;color:#fff;margin-bottom:6px}
#loginBox p{font-size:12px;color:#6b7294;margin-bottom:24px}
#loginBox input{width:100%;padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#e0e0e0;font-size:14px;outline:none;box-sizing:border-box;margin-bottom:12px}
#loginBox input:focus{border-color:#4ecdc4}
#loginBox button{width:100%;padding:10px;border-radius:8px;border:none;background:linear-gradient(135deg,#4ecdc4,#44b3ab);color:#fff;font-size:14px;font-weight:600;cursor:pointer}
#loginBox button:hover{background:#5dd4cc}
#loginBox .error{color:#ef4444;font-size:12px;min-height:18px;margin-bottom:8px}
`;
  c = c.replace('</style>', loginCSS + '\n</style>');
}

fs.writeFileSync(f, c, 'utf-8');
console.log('Login CSS moved inside style tag');
