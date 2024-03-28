import * as core from '@actions/core'
import { getLastGitTag } from './git'
import { getExecOutput } from '@actions/exec'
export type ReleaseType = 'patch' | 'minor' | 'major' | 'non-release'

export const getReleaseTypeFromCommitMessage = (commitMessage: string): ReleaseType | null => {
    if (/^(feat|fix)(\([^)]+\))?!/i.test(commitMessage))
        return 'major'
    if (/^feat/i.test(commitMessage))
        return 'minor';
    if (/^fix|chore|refactor/i.test(commitMessage))
        return 'patch';
    if (/^docs|ci|build/i.test(commitMessage))  
        return 'non-release';
    return null
}

export const getReleaseTypeFromCommits = (commits: string[]): ReleaseType | 'non-release' => {
    let highestReleaseTypeFound: ReleaseType = 'non-release'
    const precedence: { [key: string]: number } = {
        'non-release': 4,
        'patch': 3,
        'minor': 2,
        'major': 1
    };

    for (const commit of commits) {
        const commitType = getReleaseTypeFromCommitMessage(commit)
        if (commitType === null)
            continue
        if (precedence[commitType] < precedence[highestReleaseTypeFound]) {
            if (commitType === 'major') {
                return 'major'
            }
            highestReleaseTypeFound = commitType
        }
    }
    return highestReleaseTypeFound
}

export const getReleaseTypeFromCommitsSinceLastTag = async(): Promise<ReleaseType | null> => {
    try {
        core.startGroup('Getting release type from commits since last tag')
        const lastTag = await getLastGitTag({ considerReleaseCandidates: false })
        core.info(`Considering commits since [${lastTag}](${lastTag}) to HEAD`)

        const { stdout: commitsSinceLastTag, exitCode: commitsSinceLastTagExitCode } = await getExecOutput(
            `git log --oneline ${lastTag}..HEAD --pretty=format:%s`,
        )
        if (commitsSinceLastTagExitCode !== 0)
            throw Error
        core.endGroup()
        return getReleaseTypeFromCommits(commitsSinceLastTag.split('\n'))
    }
    catch (e) {
        core.error('Could not get release type from commits since last tag')
        return null
    }
}

export const getNextVersion = (options: {
    currentVersion: string
    releaseType: ReleaseType
}): string => {
    // Verify that the current version is valid semver
    if (options.currentVersion.match(/^(v?\d+\.\d+\.\d+(-[\w\d]+)?)$/) === null) {
        const errorMessage = `Invalid current version: ${options.currentVersion}`
        core.error(errorMessage)
        throw new Error(errorMessage)
    }
    // Handle the prefix in case there's one
    let prefix: string = ''
    if (options.currentVersion.startsWith('v')) {
        options.currentVersion = options.currentVersion.replace(/^v/, '')
        prefix = 'v'
    }
    const pureVersion = options.currentVersion.split('-')[0]
    const [major, minor, patch] = pureVersion.split('.').map(Number)
    const nextVersion = {
        'major': () => `${major + 1}.0.0`,
        'minor': () => `${major}.${minor + 1}.0`,
        'patch': () => `${major}.${minor}.${patch + 1}`,
        'non-release': () => pureVersion,
    }
    return prefix + nextVersion[options.releaseType]()
}

export const getPureVersion = (version: string) => version.split('-')[0]
