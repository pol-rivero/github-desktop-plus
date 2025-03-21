import * as React from 'react'
import {
  ApplicationTheme,
  supportsSystemThemeChanges,
  getCurrentlyAppliedTheme,
} from '../lib/application-theme'
import { TitleBarStyle } from '../lib/title-bar-style'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { RadioGroup } from '../lib/radio-group'
import { Select } from '../lib/select'
import { encodePathAsUrl } from '../../lib/path'
import { tabSizeDefault } from '../../lib/stores/app-store'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface IAppearanceProps {
  readonly selectedTheme: ApplicationTheme
  readonly onSelectedThemeChanged: (theme: ApplicationTheme) => void
  readonly selectedTabSize: number
  readonly onSelectedTabSizeChanged: (tabSize: number) => void
  readonly titleBarStyle: TitleBarStyle
  readonly onTitleBarStyleChanged: (titleBarStyle: TitleBarStyle) => void
  readonly showRecentRepositories: boolean
  readonly onShowRecentRepositoriesChanged: (show: boolean) => void
}

interface IAppearanceState {
  readonly selectedTheme: ApplicationTheme | null
  readonly selectedTabSize: number
  readonly titleBarStyle: TitleBarStyle
  readonly showRecentRepositories: boolean
}

function getTitleBarStyleDescription(titleBarStyle: TitleBarStyle): string {
  switch (titleBarStyle) {
    case 'custom':
      return 'Uses the menu system provided by GitHub Desktop, hiding the default chrome provided by your window manager.'
    case 'native':
      return 'Uses the menu system and chrome provided by your window manager.'
  }
}

export class Appearance extends React.Component<
  IAppearanceProps,
  IAppearanceState
> {
  public constructor(props: IAppearanceProps) {
    super(props)

    const usePropTheme =
      props.selectedTheme !== ApplicationTheme.System ||
      supportsSystemThemeChanges()

    this.state = {
      selectedTheme: usePropTheme ? props.selectedTheme : null,
      selectedTabSize: props.selectedTabSize,
      titleBarStyle: props.titleBarStyle,
      showRecentRepositories: props.showRecentRepositories,
    }

    if (!usePropTheme) {
      this.initializeSelectedTheme()
    }
  }

  public async componentDidUpdate(prevProps: IAppearanceProps) {
    if (prevProps === this.props) {
      return
    }

    const usePropTheme =
      this.props.selectedTheme !== ApplicationTheme.System ||
      supportsSystemThemeChanges()

    const selectedTheme = usePropTheme
      ? this.props.selectedTheme
      : await getCurrentlyAppliedTheme()

    const selectedTabSize = this.props.selectedTabSize

    this.setState({ selectedTheme, selectedTabSize })
  }

  private initializeSelectedTheme = async () => {
    const selectedTheme = await getCurrentlyAppliedTheme()
    const selectedTabSize = this.props.selectedTabSize
    this.setState({ selectedTheme, selectedTabSize })
  }

  private onSelectedThemeChanged = (theme: ApplicationTheme) => {
    this.props.onSelectedThemeChanged(theme)
  }

  private onShowRecentRepositoriesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const show = event.currentTarget.checked
    this.setState({ showRecentRepositories: show })
    this.props.onShowRecentRepositoriesChanged(show)
  }

  private onSelectedTabSizeChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.props.onSelectedTabSizeChanged(parseInt(event.currentTarget.value))
  }

  private onSelectChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const titleBarStyle = event.currentTarget.value as TitleBarStyle
    this.setState({ titleBarStyle })
    this.props.onTitleBarStyleChanged(titleBarStyle)
  }

  public renderThemeSwatch = (theme: ApplicationTheme) => {
    const darkThemeImage = encodePathAsUrl(__dirname, 'static/ghd_dark.svg')
    const lightThemeImage = encodePathAsUrl(__dirname, 'static/ghd_light.svg')

    switch (theme) {
      case ApplicationTheme.Light:
        return (
          <span>
            <img src={lightThemeImage} alt="" />
            <span className="theme-value-label">Light</span>
          </span>
        )
      case ApplicationTheme.Dark:
        return (
          <span>
            <img src={darkThemeImage} alt="" />
            <span className="theme-value-label">Dark</span>
          </span>
        )
      case ApplicationTheme.System:
        /** Why three images? The system theme swatch uses the first image
         * positioned relatively to get the label container size and uses the
         * second and third positioned absolutely over first and third one
         * clipped in half to render a split dark and light theme swatch. */
        return (
          <span>
            <span className="system-theme-swatch">
              <img src={lightThemeImage} alt="" />
              <img src={lightThemeImage} alt="" />
              <img src={darkThemeImage} alt="" />
            </span>
            <span className="theme-value-label">System</span>
          </span>
        )
    }
  }

  private renderTitleBarStyleDropdown() {
    const { titleBarStyle } = this.state
    const titleBarStyleDescription = getTitleBarStyleDescription(titleBarStyle)

    return (
      <div className="advanced-section">
        <h2>Title bar style</h2>

        <Select
          value={this.state.titleBarStyle}
          onChange={this.onSelectChanged}
        >
          <option value="native">Native</option>
          <option value="custom">Custom</option>
        </Select>

        <div className="git-settings-description">
          {titleBarStyleDescription}
        </div>
      </div>
    )
  }

  private renderSelectedTheme() {
    const { selectedTheme } = this.state

    if (selectedTheme == null) {
      return <Row>Loading system theme</Row>
    }

    const themes = [
      ApplicationTheme.Light,
      ApplicationTheme.Dark,
      ...(supportsSystemThemeChanges() ? [ApplicationTheme.System] : []),
    ]

    return (
      <div className="advanced-section">
        <h2 id="theme-heading">Theme</h2>
        <Row>
          <RadioGroup<ApplicationTheme>
            ariaLabelledBy="theme-heading"
            className="theme-selector"
            selectedKey={selectedTheme}
            radioButtonKeys={themes}
            onSelectionChanged={this.onSelectedThemeChanged}
            renderRadioButtonLabelContents={this.renderThemeSwatch}
          />
        </Row>
      </div>
    )
  }

  private renderRepositoryList() {
    return (
      <div className="advanced-section">
        <h2 id="repository-list-heading">{'Repository list'}</h2>

        <Checkbox
          label="Show recent repositories"
          value={
            this.state.showRecentRepositories
              ? CheckboxValue.On
              : CheckboxValue.Off
          }
          onChange={this.onShowRecentRepositoriesChanged}
        />
      </div>
    )
  }

  private renderSelectedTabSize() {
    const availableTabSizes: number[] = [1, 2, 3, 4, 5, 6, 8, 10, 12]

    return (
      <div className="advanced-section">
        <h2 id="diff-heading">{'Diff'}</h2>

        <Select
          value={this.state.selectedTabSize.toString()}
          label={__DARWIN__ ? 'Tab Size' : 'Tab size'}
          onChange={this.onSelectedTabSizeChanged}
        >
          {availableTabSizes.map(n => (
            <option key={n} value={n}>
              {n === tabSizeDefault ? `${n} (default)` : n}
            </option>
          ))}
        </Select>
      </div>
    )
  }

  public render() {
    return (
      <DialogContent>
        {this.renderSelectedTheme()}
        {this.renderRepositoryList()}
        {this.renderSelectedTabSize()}
        {this.renderTitleBarStyleDropdown()}
      </DialogContent>
    )
  }
}
