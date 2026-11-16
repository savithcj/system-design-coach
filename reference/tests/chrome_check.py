# Real-Chrome regression check: connecting must never move boxes, and arrows must stay inside the canvas.
import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width':1200,'height':760})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file:///home/claude/sd-poc/index.html'); await pg.wait_for_timeout(300)
        async def add(cat, name):
            await pg.click('#addBtn'); await pg.fill('#pickInp', cat); await pg.keyboard.press('Enter')
            await pg.keyboard.type(name); await pg.keyboard.press('Enter')
        for c,n in [('client','Browser'),('server','API'),('database','DB'),('cache','Cache'),('queue','Kafka')]: await add(c,n)
        await pg.mouse.click(900,680)
        pos = lambda: pg.evaluate("Array.from(document.querySelectorAll('[data-node]')).map(b=>Math.round(b.getBoundingClientRect().x)+','+Math.round(b.getBoundingClientRect().y))")
        box = lambda i: pg.evaluate("(i)=>{const r=document.querySelectorAll('[data-node]')[i].getBoundingClientRect();return [r.x,r.y,r.width,r.height]}", i)
        start = await pos(); ok=True
        async def conn(i,j):
            r=await box(i); await pg.mouse.move(r[0]+r[2]/2,r[1]+r[3]/2); await pg.wait_for_timeout(150)
            h=await pg.evaluate("(i)=>{const id=document.querySelectorAll('[data-node]')[i].dataset.node;const r=document.querySelector('.handle[data-for=\"'+id+'\"][data-port=\"r\"]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}", i)
            t=await box(j); await pg.mouse.move(h[0],h[1]); await pg.mouse.down(); await pg.mouse.move(h[0]+8,h[1]+8,steps=3); await pg.mouse.move(t[0]+t[2]/2,t[1]+t[3]/2,steps=8); await pg.mouse.up(); await pg.wait_for_timeout(120)
        for i,j in [(0,1),(1,2),(1,3),(3,4),(4,2)]: await conn(i,j)
        end = await pos()
        edges = await pg.evaluate("state().edges.length")
        # every arrow path must lie inside the canvas
        out = await pg.evaluate("Array.from(document.querySelectorAll('#edgeSvg path[data-edge]')).some(p=>{const b=p.getBBox();return b.x<-2||b.y<-2})")
        print('moved:', start!=end, '| edges:', edges, '| arrows outside canvas:', out, '| errors:', errs)
        sys.exit(0 if (start==end and edges==5 and not out and not errs) else 1)
        await b.close()
asyncio.run(main())
