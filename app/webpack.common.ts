import * as path from 'path'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack from 'webpack'
import merge from 'webpack-merge'
import { getReplacements } from './app-info'

export const externals = ['7zip']

const outputDir = 'out'
export const replacements = getReplacements()

const commonConfig: webpack.Configuration = {
  optimization: {
    emitOnErrors: false,
  },
  externals: externals,
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, '..', outputDir),
    library: {
      name: '[name]',
      type: 'commonjs2',
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        include: path.resolve(__dirname, 'src'),
        use: [
          {
            loader: 'ts-loader',
          },
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.node$/,
        loader: 'awesome-node-loader',
        options: {
          name: '[name].[ext]',
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
  },
  node: {
    __dirname: false,
    __filename: false,
  },
}

export const main = merge({}, commonConfig, {
  entry: { main: path.resolve(__dirname, 'src/main-process/main') },
  target: 'electron-main',
  plugins: [
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('main'),
      })
    ),
  ],
})

export const renderer = merge({}, commonConfig, {
  entry: { renderer: path.resolve(__dirname, 'src/ui/index') },
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.(jpe?g|png|gif|ico)$/,
        use: ['file?name=[path][name].[ext]'],
      },
      {
        test: /\.cmd$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'static', 'index.html'),
      chunks: ['renderer'],
    }),
    new webpack.NormalModuleReplacementPlugin(/^vscode-jsonrpc$/, resource => {
      resource.request = 'vscode-jsonrpc/lib/node/main.js'
    }),
    new webpack.NormalModuleReplacementPlugin(
      /vscode-jsonrpc[\\/]node(\.js)?$/,
      resource => {
        resource.request = 'vscode-jsonrpc/lib/node/main.js'
      }
    ),
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('ui'),
      })
    ),
  ],
  resolve: {
    // Prevent the renderer from using browser-specific versions of modules
    aliasFields: [],
  },
})

export const crash = merge({}, commonConfig, {
  entry: { crash: path.resolve(__dirname, 'src/crash/index') },
  target: 'electron-renderer',
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Desktop Plus',
      filename: 'crash.html',
      chunks: ['crash'],
    }),
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('crash'),
      })
    ),
  ],
})

export const cli = merge({}, commonConfig, {
  entry: { cli: path.resolve(__dirname, 'src/cli/main') },
  target: 'node',
  plugins: [
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('cli'),
      })
    ),
  ],
})

export const highlighter = merge({}, commonConfig, {
  entry: { highlighter: path.resolve(__dirname, 'src/highlighter/index') },
  output: {
    library: {
      name: '[name]',
      type: 'var',
    },
    chunkFilename: 'highlighter/[name].js',
  },
  optimization: {
    chunkIds: 'named',
    splitChunks: {
      cacheGroups: {
        modes: {
          enforce: true,
          name: (mod: any) => {
            const legacy =
              /node_modules[\\\/]@codemirror[\\\/]legacy-modes[\\\/]mode[\\\/]([^\\\/.]+)/i.exec(
                mod.resource
              )
            if (legacy) {
              return `legacy/${legacy[1]}`
            }
            const parser =
              /node_modules[\\\/]@lezer[\\\/]([^\\\/]+)[\\\/]/i.exec(
                mod.resource
              )
            if (
              parser &&
              parser[1] !== 'common' &&
              parser[1] !== 'highlight' &&
              parser[1] !== 'lr'
            ) {
              return `parser/${parser[1]}`
            }
            const externalParser =
              /node_modules[\\\/]lezer-([^\\\/]+)[\\\/]/i.exec(mod.resource)
            if (externalParser) {
              return `parser/${externalParser[1]}`
            }
            const localStream =
              /src[\\\/]highlighter[\\\/]languages[\\\/]([^\\\/.]+)\.ts$/i.exec(
                mod.resource
              )
            if (localStream) {
              return `local/${localStream[1]}`
            }
            return 'common'
          },
        },
      },
    },
  },
  target: 'webworker',
  plugins: [
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('highlighter'),
      })
    ),
  ],
})

highlighter.module!.rules = [
  {
    test: /\.ts$/,
    include: path.resolve(__dirname, 'src/highlighter'),
    use: [
      {
        loader: 'ts-loader',
        options: {
          configFile: path.resolve(__dirname, 'src/highlighter/tsconfig.json'),
        },
      },
    ],
    exclude: /node_modules/,
  },
]
