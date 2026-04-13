import type { BackgroundContext, BackgroundPlugin } from '../types';

export const loadPlugins = async (context: BackgroundContext): Promise<BackgroundPlugin[]> => {
  const [menuModule, valuesModule, flagModule] = await Promise.all([
    import('./menu-icon'),
    import('./values'),
    import('./flag'),
  ]);

  const plugins: BackgroundPlugin[] = [];

  if (context.runtimeOptions.pluginFlags.menuIcon && menuModule?.MenuIcon) {
    plugins.push(
      new menuModule.MenuIcon({
        scene: context.scene,
        camera: context.camera,
        renderer: context.renderer,
        menuSettings: context.menuSettings,
        requestFrame: context.requestFrame,
      }),
    );
  }

  if (context.runtimeOptions.pluginFlags.valuesIcon && valuesModule?.ValuesIcon) {
    plugins.push(
      new valuesModule.ValuesIcon({
        scene: context.scene,
        camera: context.camera,
        renderer: context.renderer,
        valuesSettings: context.valuesSettings,
        requestFrame: context.requestFrame,
      }),
    );
  }

  if (context.runtimeOptions.pluginFlags.flag && flagModule?.FlagPlugin) {
    plugins.push(
      new flagModule.FlagPlugin({
        scene: context.scene,
        camera: context.camera,
        renderer: context.renderer,
        requestFrame: context.requestFrame,
        flagSettings: context.flagSettings,
      }),
    );
  }

  return plugins;
};
