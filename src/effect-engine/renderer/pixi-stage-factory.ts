import { Application, Container } from 'pixi.js'

export async function createPixiApp(size: { width: number; height: number }) {
  const app = new Application()
  await app.init({
    width: size.width,
    height: size.height,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: false,
    preference: 'webgl',
    clearBeforeRender: true,
    autoStart: false,
    sharedTicker: false,
  })
  app.stop()

  const root = new Container()
  app.stage.addChild(root)

  return {
    app,
    root,
  }
}
