const fs = require('fs');
const path = require('path');
const dir = 'c:/Users/Desktop/Desktop/Projects/WebApps/Automate Karaoke/public/songs/lyrics';
const files = [
  'Maldita Porque.txt',
  'Jireh-Lim Buko.txt',
  'Cup-of-Joe Multo.txt',
  'Juan-karlos Ere.txt',
  'Radiohead Creep.txt',
  'Cranberries Zombie.txt',
  'Session-Road Cool off.txt',
  'Jason-Marz I\'m Yours.txt',
  'Up-Dharma Tadhana.txt',
  'Jennylyn-Mercado  Till My Heartache End.txt'
];

files.forEach(f => {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    const offsetRegex = /^\[offset:\s*(-?\d+)\]/mi;
    const match = content.match(offsetRegex);
    if (match) {
      const oldOffset = parseInt(match[1]);
      const newOffset = oldOffset + 700;
      content = content.replace(offsetRegex, `[offset: ${newOffset}]`);
      fs.writeFileSync(p, content);
      console.log(`${f}: ${oldOffset} -> ${newOffset}`);
    } else {
      content = `[offset: 700]\n` + content;
      fs.writeFileSync(p, content);
      console.log(`${f}: No offset found, added [offset: 700]`);
    }
  } else {
    console.log(`Not found: ${f}`);
  }
});
