const urls = [
    'https://drive.google.com/file/d/1zrc6CZczVATEhP6PbTkKu3kZn5CdWnaN/view?usp=sharing',
    'n/file/d/1zrc6CZczVATEhP6PbTkKu3kZn5CdWnaN/view?usp=sharing'
];

urls.forEach(url => {
    let embedUrl = url;
    const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) {
            embedUrl = `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#grid`;
        } else {
            const fileMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
            if (fileMatch) {
                embedUrl = `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
            } else {
                embedUrl = url.replace('/view', '/preview').replace('/open?', '/file/d/');
            }
        }
    console.log(embedUrl);
});
