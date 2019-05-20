// server.js
// where your node app starts


// init project
const express = require('express');
const fs = require('fs');
const paths = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

const dir = 'docs';
const scripts_dir = 'scripts';

// we've started you off with Express, 
// but feel free to use whatever libs or frameworks you'd like through `package.json`.

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));
app.use(cors());
app.use(bodyParser.json({limit: '50mb'}));


console.log("the domains is", process.env.PROJECT_DOMAIN)

function parseId(req) {
    //strip out non-alphanumeric characters for safety
    return req.params.id.replace(/\W/g, '_')
}

function docPath(id) {
    return paths.join(__dirname, dir, id + '.json')
}

app.get("/info", (req,res) => {
    res.json({
        assetUpload:false,
        authentication:true,
        scriptEditing:false,
        passwordSupported:true,
        docDeleteSupported:true,
    })
})

const OWNER_USER = {
    username:'some-username'
}

function checkAuth(req,res,next) {
    if(req.query.password && req.query.password === process.env.PASSWORD) {
        const token=req.query.password
        req.username = OWNER_USER.username
        return next()
    }
    if(req.headers['access-key'] && req.headers['access-key'] === process.env.PASSWORD) {
        req.user = OWNER_USER
        req.username = OWNER_USER.username
        return next()
    }

    return res.json({success:false,message:'invalid access token, cannot find user'})
}

app.get("/userinfo", checkAuth, (req,res) => {
    res.json({
        success:true,
        username:req.username,
    })
})

function loadDocInfo(fname) {
    const fpath = paths.join(__dirname,dir,fname)
    const id = fname.substring(0,fname.length-'.json'.length)
    return new Promise((res,rej) => {
        fs.readFile(fpath,(e,contents) => {
            if(e) return rej(e)
            const content = JSON.parse(contents.toString())
            res({
                id:id,
                title:content.title
            })
        })
    })
}

function getDocList(cb) {
    return new Promise((res,rej) => {
        fs.readdir(paths.join(__dirname, dir),(e,files)=> {
            if (e) return rej(e)
            res(files)
        })
    }).then(files => {
        return Promise.all(files.map(name => loadDocInfo(name))
    })
}

app.get('/doc/list',checkAuth,(req,res) => {
    getDocList().then(list => res.json(list))
})

app.get("/doc/:id", (req, res) => {
    const id = parseId(req)
    const pth = docPath(id)
    console.log('docpath is',pth)
    res.sendFile(pth)
})


app.post("/doc/:id",checkAuth, (req, res) => {
    const id = parseId(req)
    console.log("body is",req.body)
    console.log('title is',req.body.title)
    const data = JSON.stringify(req.body, null, '    ');
    //console.log("writing",data)
    fs.writeFile(docPath(id),data,(err)=>{
        if(err) {
            console.log("failed",err)
            res.json({success:false,message:"could not save"})
        }
        res.json({success:true,message:"saved it!"})
    })
})


app.post('/doc/delete/:id', checkAuth, (req,res)=>{
    const id = parseId(req)
    const pth = docPath(id)
    console.log("trying to delete",id,pth)
    fs.unlinkSync(pth)
    res.json({success:true, script:id, message:'deleted'})
})


function supportedMimetype(type,name) {
    console.log('checking type',type,name)
    if(type === 'image/png') return true
    if(type === 'image/jpeg') return true
    if(type === 'audio/mpeg') return true
    if(type === 'video/mp4') return true
    if(type === 'model/gltf-binary') return true
    return false
}

app.get('/asset/list',(req,res) => {
    let assetsStr = (fs.readFileSync(paths.join(process.cwd(),'.glitch-assets')).toString())
    const assets = assetsStr.split("\n")
        .filter(str => str.trim().length > 0)
        .map(e => JSON.parse(e))
        .filter(e => !e.deleted)
        .map(el => {
            console.log("element",el)
            console.log('type',el.type, el.name)
            let type = el.type
            if(el.name.toLowerCase().endsWith('.glb')) {
                type = 'model/gltf-binary'
            }
            el = {
                kind:'asset',
                id:el.uuid,
                url:el.url,
                mimeType:type,
                title:el.name,
            }
            return el
        })
        .filter(e => supportedMimetype(e.mimeType, e.title))
    console.log("assets", assets)
    res.json(assets)
})


function parseScriptMetadata(fpath) {
    return new Promise((res,rej) => {
        fs.readFile(fpath,(err,data)=>{
            const meta = {
                title:null,
                description:null,
            }
            if(!data) return res(meta)
            const contents = data.toString()
            //console.log("scanning",contents)
            const title = contents.match(/\#title(.*)/)
            //console.log("match",title)
            if(title) meta.title = title[1]
            const desc = contents.match(/\#description(.*)/)
            //console.log("match",desc)
            if(desc) meta.description = desc[1]
            res(meta)
        })
    })
}


app.get('/scripts/list',(req,res) => {
    console.log(process.env.PROJECT_DOMAIN)
    fs.readdir(paths.join(__dirname, scripts_dir),(e,files)=>{
        if(e) return res.json({success:false})
        Promise.all(files.map(name =>  {
            const fpath = paths.join(__dirname, scripts_dir,name)
            return parseScriptMetadata(fpath).then(meta => {
                const id = name.substring(0,name.length-'.js'.length)
                let title = id
                meta.name = name
                meta.url = `https://${process.env.PROJECT_DOMAIN}.glitch.me/scripts/${name}`
                return meta
            })
        })).then(outs => {
            res.json(outs)
        })
    })
})

app.get("/scripts/:id", (req, res) => {
    const pth = paths.join(__dirname,scripts_dir,req.params.id)
    console.log('docpath is',pth)
    res.sendFile(pth)
})


// http://expressjs.com/en/starter/basic-routing.html
app.get('/', function(request, response) {
    getDocList((docs)=>{
        const list = docs.map(doc => {
            return `
      <li>
          ${doc.title}
        <a class='edit'
href="./.build/?SERVER_URL=${process.env.PROJECT_DOMAIN}.glitch.me&mode=edit&doc=${doc.id}">
          edit
        </a>
        <a class='view'
href="./.build/?SERVER_URL=${process.env.PROJECT_DOMAIN}.glitch.me&mode=vrview&doc=${doc.id}">
          view
        </a>
      </li>
    `
        })
        response.send(`<html>
<head>
 <link rel='stylesheet' href="./frontpage.css">
</head>
<body>
<a href="./.build/?SERVER_URL=${process.env.PROJECT_DOMAIN}.glitch.me&mode=edit">make new project</a>
<h3>existing projects</h3>
<ul>
${list.join("")}
</ul>
</body>
<script>
if(navigator.xr) {
  document.body.classList.add('xrviewer')
}
</script>
</html>
`)
    })
    // const pth = __dirname + '/views/index.html'
    // const pth = docPath('foo')
    // console.log('sending',pth)
    // response.sendFile(pth);
});


// listen for requests :)
const listener = app.listen(process.env.PORT, function() {
    console.log('Your app is listening on port ' + listener.address().port);
});
